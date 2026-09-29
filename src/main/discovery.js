const dgram = require('dgram');
const os = require('os');
const EventEmitter = require('events');

const APP_TAG = 'officelink';
const MULTICAST = '239.45.32.20';
const SKIP_IFACE =
  /^(lo|awdl|llw|utun|vmnet|vboxnet|docker|br-|veth|ciscodump|ap\d|ipsec|ppp|gif|stf|anpi|pktap|bridge0|bluetooth|tailscale|zerotier|wg\d|tun|tap)/i;
const SKIP_IFACE_NAME =
  /vEthernet|VMware|VirtualBox|Hyper-V|WSL|Loopback|Bluetooth|Tailscale|ZeroTier|OpenVPN|TAP-Windows|Cisco AnyConnect|Npcap|Hamachi|radmin/i;
const VIRTUAL_MAC = /^(00:50:56|00:0C:29|00:05:69|08:00:27|00:15:5D|02:42)/i;

function ipToInt(ip) {
  return String(ip || '')
    .split('.')
    .reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}

function intToIp(n) {
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.');
}

function isIpv4(ip) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip || ''));
}

function isLinkLocal(ip) {
  return String(ip || '').startsWith('169.254.');
}

function isVirtualIface(name) {
  const n = String(name || '');
  return SKIP_IFACE.test(n) || SKIP_IFACE_NAME.test(n);
}

function isVirtualMac(mac) {
  const m = String(mac || '')
    .toUpperCase()
    .replace(/-/g, ':');
  return VIRTUAL_MAC.test(m);
}

function ifaceKind(name) {
  const n = String(name || '');
  if (/wi-?fi|wlan|airport|wireless/i.test(n)) return 'Wi-Fi';
  if (/ether|local area connection|^eth\d/i.test(n)) return 'LAN';
  if (/^en\d/i.test(n)) return 'Network';
  return 'Network';
}

function sameSubnet(a, b) {
  if (!a || !b) return false;
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  if (pa.length !== 4 || pb.length !== 4) return false;
  return pa[0] === pb[0] && pa[1] === pb[1] && pa[2] === pb[2];
}

function onSameNetwork(ip, address, netmask) {
  if (!isIpv4(ip) || !isIpv4(address)) return false;
  const mask = ipToInt(netmask || '255.255.255.0');
  return (ipToInt(ip) & mask) === (ipToInt(address) & mask);
}

function reachableOn(ip, ifaces) {
  return (ifaces || localAddresses()).some((iface) => onSameNetwork(ip, iface.address, iface.netmask));
}

function localAddressFor(ip) {
  if (!isIpv4(ip)) return undefined;
  for (const iface of localAddresses()) {
    if (onSameNetwork(ip, iface.address, iface.netmask)) return iface.address;
  }
  return undefined;
}

function hostsOnInterface({ address, netmask }) {
  if (!isIpv4(address) || isLinkLocal(address) || address.startsWith('127.')) return [];
  const addr = ipToInt(address);
  const mask = ipToInt(netmask || '255.255.255.0');
  const network = (addr & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const count = (broadcast - network - 1) >>> 0;
  const out = [];
  if (count <= 0 || count > 1022) {
    const prefix = address.split('.').slice(0, 3).join('.');
    const self = Number(address.split('.')[3]);
    for (let i = 1; i < 255; i++) if (i !== self) out.push(`${prefix}.${i}`);
    return out;
  }
  for (let host = network + 1; host < broadcast; host++) {
    if (host === addr) continue;
    out.push(intToIp(host));
  }
  return out;
}

/**
 * Wi-Fi and Ethernet (LAN) addresses on this computer.
 * Virtual adapters (VPN, Hyper-V, Docker, VMware) are skipped so mixed
 * Wi-Fi + cable offices still find each other on the router LAN.
 */
function localAddresses() {
  const physical = [];
  const fallback = [];
  let interfaces = {};
  try {
    interfaces = os.networkInterfaces();
  } catch {
    return physical;
  }
  for (const [name, list] of Object.entries(interfaces)) {
    for (const info of list || []) {
      if (info.family !== 'IPv4' && info.family !== 4) continue;
      if (info.internal) continue;
      if (!isIpv4(info.address)) continue;
      const entry = {
        name,
        address: info.address,
        netmask: info.netmask,
        mac: info.mac,
        kind: ifaceKind(name),
      };
      const virtual = isVirtualIface(name) || isVirtualMac(info.mac) || isLinkLocal(info.address);
      if (virtual) fallback.push(entry);
      else physical.push(entry);
    }
  }
  const chosen = physical.length ? physical : fallback.filter((e) => !isLinkLocal(e.address));
  chosen.sort((a, b) => {
    const rank = (e) => {
      if (e.kind === 'LAN') return 3;
      if (e.kind === 'Wi-Fi') return 2;
      if (e.address.startsWith('192.168.')) return 1;
      return 0;
    };
    return rank(b) - rank(a);
  });
  return chosen;
}

function broadcastFor({ address, netmask }) {
  if (!netmask) return '255.255.255.255';
  return intToIp((ipToInt(address) | (~ipToInt(netmask) >>> 0)) >>> 0);
}

function createUdp({ reusePort = false } = {}) {
  const opts = { type: 'udp4', reuseAddr: true };
  if (reusePort) opts.reusePort = true;
  try {
    return dgram.createSocket(opts);
  } catch {
    return dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }
}

function bindSocket(port, address, { reusePort = false } = {}) {
  return new Promise((resolve, reject) => {
    const socket = createUdp({ reusePort });
    socket.once('error', reject);
    socket.bind({ port, address, exclusive: false }, () => {
      socket.removeListener('error', reject);
      try {
        socket.setBroadcast(true);
      } catch {
        // some interfaces reject broadcast
      }
      try {
        socket.setMulticastTTL(4);
        socket.setMulticastLoopback(true);
      } catch {
        // ignore
      }
      resolve(socket);
    });
  });
}

/**
 * Finds other OfficeLink instances on the local network.
 * On macOS we receive on one wildcard socket and send from each
 * Wi-Fi/LAN address. Binding several sockets to the same port with
 * SO_REUSEPORT drops broadcasts on Darwin.
 */
class Discovery extends EventEmitter {
  constructor({ port, getBeacon, interval = 2000 }) {
    super();
    this.port = port;
    this.getBeacon = getBeacon;
    this.interval = interval;
    this.sockets = new Map();
    this.tx = new Map();
    this.timer = null;
    this.bursts = [];
    this.isMac = process.platform === 'darwin';
  }

  async start() {
    await this.refreshSockets();
    this.announce('hello');
    for (const ms of [100, 300, 700, 1500, 3000, 6000, 12000]) {
      this.bursts.push(setTimeout(() => this.announce('hello'), ms));
    }
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

  joinMulticast(socket, ifaceIp) {
    try {
      if (ifaceIp) socket.addMembership(MULTICAST, ifaceIp);
      else socket.addMembership(MULTICAST);
    } catch {
      // already a member, or OS rejected it
    }
    if (ifaceIp) {
      try {
        socket.setMulticastInterface(ifaceIp);
      } catch {
        // ignore
      }
    }
  }

  async ensureRecv() {
    if (this.sockets.has('0.0.0.0')) return this.sockets.get('0.0.0.0');
    try {
      const socket = await bindSocket(this.port, '0.0.0.0', { reusePort: false });
      this.wire(socket);
      for (const iface of localAddresses()) this.joinMulticast(socket, iface.address);
      this.sockets.set('0.0.0.0', socket);
      return socket;
    } catch (err) {
      this.emit('error', err);
      return null;
    }
  }

  async ensureTx(address) {
    if (this.tx.has(address)) return this.tx.get(address);
    try {
      const socket = await bindSocket(this.isMac ? 0 : this.port, address, { reusePort: !this.isMac });
      if (!this.isMac) this.wire(socket);
      this.joinMulticast(socket, address);
      this.tx.set(address, socket);
      if (!this.isMac) this.sockets.set(address, socket);
      return socket;
    } catch (err) {
      this.emit('error', err);
      return null;
    }
  }

  async refreshSockets() {
    await this.ensureRecv();
    const ifaces = localAddresses();
    const wanted = new Set(ifaces.map((a) => a.address));
    for (const addr of wanted) await this.ensureTx(addr);
    for (const [addr, socket] of this.tx) {
      if (wanted.has(addr)) continue;
      this.tx.delete(addr);
      this.sockets.delete(addr);
      try {
        socket.close();
      } catch {
        // gone
      }
    }
    const recv = this.sockets.get('0.0.0.0');
    if (recv) {
      for (const iface of ifaces) this.joinMulticast(recv, iface.address);
    }
  }

  senders() {
    const list = [...this.tx.values()];
    const wildcard = this.sockets.get('0.0.0.0');
    if (wildcard && !this.isMac) list.push(wildcard);
    if (!list.length && wildcard) list.push(wildcard);
    return list;
  }

  send(payload, address, fromSocket) {
    const buf = Buffer.from(JSON.stringify(payload));
    const sockets = fromSocket ? [fromSocket] : this.senders();
    for (const socket of sockets) {
      try {
        socket.send(buf, this.port, address, () => {});
      } catch {
        // Interface may have disappeared (Wi-Fi switched off, VPN, etc.)
      }
    }
  }

  announce(type = 'beacon') {
    let payload;
    try {
      payload = { ...this.getBeacon(), type };
    } catch (err) {
      this.emit('error', err);
      return;
    }
    if (!payload.port) return;
    for (const iface of localAddresses()) {
      const sock = this.tx.get(iface.address);
      if (!sock) continue;
      this.send(payload, broadcastFor(iface), sock);
      this.send(payload, '255.255.255.255', sock);
      this.send(payload, MULTICAST, sock);
    }
    if (!this.tx.size) {
      this.send(payload, '255.255.255.255');
      this.send(payload, MULTICAST);
    }
  }

  reply(address) {
    if (!address) return;
    this.send({ ...this.getBeacon(), type: 'reply' }, address);
  }

  unicast(address) {
    if (!address) return;
    let payload;
    try {
      payload = { ...this.getBeacon(), type: 'beacon' };
    } catch {
      return;
    }
    if (!payload.port) return;
    this.send(payload, address);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.bursts) clearTimeout(t);
    this.bursts = [];
    try {
      this.announce('bye');
    } catch {
      // ignore
    }
    const sockets = [...this.sockets.values(), ...this.tx.values()];
    this.sockets.clear();
    this.tx.clear();
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

module.exports = {
  Discovery,
  localAddresses,
  APP_TAG,
  MULTICAST,
  sameSubnet,
  onSameNetwork,
  reachableOn,
  localAddressFor,
  hostsOnInterface,
  isVirtualIface,
  ifaceKind,
  isIpv4,
};
