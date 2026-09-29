const dgram = require('dgram');
const os = require('os');
const EventEmitter = require('events');

const APP_TAG = 'officelink';
const SKIP_IFACE = /^(lo|awdl|llw|utun|bridge|vmnet|vboxnet|docker|br-|veth|ciscodump|ap\d|ipsec|ppp|gif|stf|anpi|pktap)/i;

function ipToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}

function intToIp(n) {
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.');
}

function isLinkLocal(ip) {
  return ip.startsWith('169.254.');
}

function isVirtualIface(name) {
  return SKIP_IFACE.test(name);
}

/** Non-internal IPv4 addresses of this machine, preferring real LAN adapters. */
function localAddresses() {
  const primary = [];
  const fallback = [];
  let interfaces = {};
  try {
    interfaces = os.networkInterfaces();
  } catch {
    return primary;
  }
  for (const [name, list] of Object.entries(interfaces)) {
    for (const info of list || []) {
      if (info.family !== 'IPv4' && info.family !== 4) continue;
      if (info.internal) continue;
      const entry = { name, address: info.address, netmask: info.netmask };
      if (isVirtualIface(name) || isLinkLocal(info.address)) fallback.push(entry);
      else primary.push(entry);
    }
  }
  return primary.length ? primary : fallback;
}

function broadcastFor({ address, netmask }) {
  if (!netmask) return '255.255.255.255';
  return intToIp((ipToInt(address) | (~ipToInt(netmask) >>> 0)) >>> 0);
}

function broadcastAddresses() {
  const set = new Set(['255.255.255.255']);
  for (const iface of localAddresses()) set.add(broadcastFor(iface));
  return [...set];
}

function bindSocket(port, address) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.once('error', reject);
    socket.bind({ port, address, exclusive: false }, () => {
      socket.removeListener('error', reject);
      try {
        socket.setBroadcast(true);
      } catch {
        // some interfaces reject broadcast
      }
      resolve(socket);
    });
  });
}

/**
 * Finds other OfficeLink instances on the local network by periodically
 * broadcasting a small UDP beacon on every real IPv4 interface.
 * macOS needs a socket per Wi-Fi/Ethernet address or broadcasts are dropped.
 */
class Discovery extends EventEmitter {
  constructor({ port, getBeacon, interval = 2500 }) {
    super();
    this.port = port;
    this.getBeacon = getBeacon;
    this.interval = interval;
    this.sockets = new Map();
    this.timer = null;
  }

  async start() {
    await this.ensureSocket('0.0.0.0');
    await this.refreshSockets();
    this.announce();
    this.timer = setInterval(() => {
      this.refreshSockets().catch(() => {});
      this.announce();
    }, this.interval);
    return true;
  }

  wire(socket) {
    socket.on('error', (err) => this.emit('error', err));
    socket.on('message', (buf, rinfo) => {
      let data;
      try {
        data = JSON.parse(buf.toString('utf8'));
      } catch {
        return;
      }
      if (!data || data.app !== APP_TAG) return;
      this.emit('beacon', data, rinfo.address);
    });
  }

  async ensureSocket(address) {
    if (this.sockets.has(address)) return this.sockets.get(address);
    try {
      const socket = await bindSocket(this.port, address);
      this.wire(socket);
      this.sockets.set(address, socket);
      return socket;
    } catch (err) {
      this.emit('error', err);
      return null;
    }
  }

  async refreshSockets() {
    const wanted = new Set(['0.0.0.0', ...localAddresses().map((a) => a.address)]);
    for (const addr of wanted) await this.ensureSocket(addr);
    for (const [addr, socket] of this.sockets) {
      if (wanted.has(addr)) continue;
      this.sockets.delete(addr);
      try {
        socket.close();
      } catch {
        // gone
      }
    }
  }

  send(payload, address, fromSocket) {
    const buf = Buffer.from(JSON.stringify(payload));
    const sockets = fromSocket ? [fromSocket] : [...this.sockets.values()];
    for (const socket of sockets) {
      try {
        socket.send(buf, this.port, address, () => {});
      } catch {
        // Interface may have disappeared (Wi-Fi switched off, VPN, etc.)
      }
    }
  }

  announce(type = 'beacon') {
    const payload = { ...this.getBeacon(), type };
    const wildcard = this.sockets.get('0.0.0.0');
    if (wildcard) this.send(payload, '255.255.255.255', wildcard);
    for (const iface of localAddresses()) {
      const sock = this.sockets.get(iface.address);
      if (!sock) continue;
      this.send(payload, broadcastFor(iface), sock);
      this.send(payload, '255.255.255.255', sock);
    }
  }

  reply(address) {
    this.send({ ...this.getBeacon(), type: 'reply' }, address);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.announce('bye');
    } catch {
      // ignore
    }
    const sockets = [...this.sockets.values()];
    this.sockets.clear();
    setTimeout(() => {
      for (const socket of sockets) {
        try {
          socket.close();
        } catch {
          // already closed
        }
      }
    }, 100);
  }
}

module.exports = { Discovery, localAddresses, APP_TAG };
