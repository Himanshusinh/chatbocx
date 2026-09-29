const EventEmitter = require('events');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const http = require('http');
const os = require('os');
const { Transform, pipeline } = require('stream');
const { JsonFile } = require('./store');
const { Discovery, localAddresses, APP_TAG, sameSubnet, hostsOnInterface, reachableOn, ifaceKind, isIpv4, localAddressFor } = require('./discovery');
const { BonjourDiscovery } = require('./bonjour');
const { collectSource } = require('./codepack');

const PROTOCOL_VERSION = 1;
const ONLINE_TIMEOUT = 15000;
const OUTBOX_LIMIT = 2000;
const BATCH_SIZE = 50;
const MAX_BODY = 20 * 1024 * 1024;
const MAX_TEXT = 20000;
const CHUNK = 1024 * 1024;
const COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b'];
const THUMB_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic', '.tif', '.tiff', '.pdf', '.mp4', '.mov', '.m4v']);

const uid = () => crypto.randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function dmId(a, b) {
  return `dm:${[a, b].sort().join(':')}`;
}

function cleanIp(ip) {
  if (!ip) return ip;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** Makes a received file name safe to write on macOS and Windows. */
function safeFileName(name) {
  let base = path.basename(String(name || '').replace(/\\/g, '/'));
  base = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(base)) base = `_${base}`;
  return base.slice(0, 200) || 'file';
}

async function uniquePath(dir, name) {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 0; i < 10000; i++) {
    const candidate = path.join(dir, i === 0 ? name : `${stem} (${i})${ext}`);
    try {
      await fsp.access(candidate);
    } catch {
      return candidate;
    }
  }
  return path.join(dir, `${stem}-${Date.now()}${ext}`);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

class ChatEngine extends EventEmitter {
  constructor(opts) {
    super();
    this.dataDir = opts.dataDir;
    this.discoveryPort = opts.discoveryPort ?? 45320;
    this.preferredPort = opts.httpPort ?? 45321;
    this.enableDiscovery = opts.enableDiscovery !== false;
    this.makeThumbnail = opts.makeThumbnail || null;
    this.presenceInterval = opts.presenceInterval ?? 3000;
    this.appVersion = String(opts.appVersion || require('../../package.json').version);
    this.codeRoot = opts.codeRoot || path.join(__dirname, '..', '..');
    this.defaultFeedDirs = Array.isArray(opts.feedDirs) ? opts.feedDirs : [];

    fs.mkdirSync(path.join(this.dataDir, 'conversations'), { recursive: true });

    this.config = new JsonFile(path.join(this.dataDir, 'config.json'), () => ({
      onboarded: false,
      profile: {
        id: uid(),
        name: opts.defaultName || os.userInfo().username || 'Me',
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        status: 'online',
      },
      settings: {},
    }));
    this.config.data.settings = {
      downloadDir: opts.defaultDownloadDir || path.join(os.homedir(), 'Downloads', 'OfficeLink'),
      autoDownloadMB: 25,
      notifications: true,
      theme: 'system',
      workspace: '',
      runInBackground: true,
      autoUpdate: true,
      shareUpdates: true,
      updateFeedDir: '',
      updateRepo: '',
      updateBranch: 'main',
      ...this.config.data.settings,
    };
    this.config.save();

    this.peersFile = new JsonFile(path.join(this.dataDir, 'peers.json'), {}, { delay: 3000 });
    this.groupsFile = new JsonFile(path.join(this.dataDir, 'groups.json'), {});
    this.outboxFile = new JsonFile(path.join(this.dataDir, 'outbox.json'), {});
    this.sharedFile = new JsonFile(path.join(this.dataDir, 'shared.json'), {});
    this.metaFile = new JsonFile(path.join(this.dataDir, 'meta.json'), () => ({
      unread: {},
      lastActivity: {},
      readSent: {},
      pinned: [],
      muted: [],
    }));
    this.metaFile.data.unread ||= {};
    this.metaFile.data.lastActivity ||= {};
    this.metaFile.data.readSent ||= {};
    this.metaFile.data.pinned ||= [];
    this.metaFile.data.muted ||= [];

    this.convs = new Map();
    this.convFiles = new Map();
    this.fileIndex = new Map();
    this.seen = new Map();
    this.flushing = new Set();
    this.downloads = new Map();
    this.pendingAcks = new Map();
    this.lastCollected = new Map();
    this.notedJoins = new Set();
    this.helloBusy = new Set();
    this.bonjour = null;
    this.startedAt = Date.now();
    this.syncing = false;
    this.scanning = false;
    this.lastOnline = '';
    this.activeConv = null;
    this.focused = true;
    this.stateTimer = null;
    this.timers = [];
    this.port = null;
    this.loadConversations();
  }

  get me() {
    return this.config.data.profile;
  }

  get settings() {
    return this.config.data.settings;
  }

  get workspace() {
    return (this.settings.workspace || '').trim().toLowerCase();
  }

  // ---------------------------------------------------------------- storage

  convFileName(convId) {
    return path.join(this.dataDir, 'conversations', `${convId.replace(/[^a-z0-9-]/gi, '_')}.json`);
  }

  loadConversations() {
    const dir = path.join(this.dataDir, 'conversations');
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const list = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (!Array.isArray(list) || !list.length) continue;
        const convId = list[0].convId;
        for (const m of list) {
          if (m.file && m.file.state === 'downloading') {
            m.file.state = 'failed';
            m.file.error = 'Interrupted. Click retry to resume.';
          }
          if (m.file && m.file.localPath) this.fileIndex.set(m.file.id, m.file.localPath);
        }
        this.convs.set(convId, list);
      } catch (err) {
        console.error('Could not load conversation', f, err);
      }
    }
    for (const [id, entry] of Object.entries(this.sharedFile.data)) this.fileIndex.set(id, entry.path);
  }

  getConv(convId) {
    let list = this.convs.get(convId);
    if (!list) {
      list = [];
      this.convs.set(convId, list);
    }
    return list;
  }

  saveConv(convId) {
    let file = this.convFiles.get(convId);
    if (!file) {
      file = new JsonFile(this.convFileName(convId), []);
      this.convFiles.set(convId, file);
    }
    file.data = this.getConv(convId);
    file.save();
  }

  findMessage(convId, msgId) {
    const list = this.convs.get(convId);
    if (!list) return null;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].id === msgId) return list[i];
    return null;
  }

  insertMessage(msg) {
    const list = this.getConv(msg.convId);
    let i = list.length;
    while (i > 0 && list[i - 1].ts > msg.ts) i--;
    list.splice(i, 0, msg);
    this.metaFile.data.lastActivity[msg.convId] = Math.max(this.metaFile.data.lastActivity[msg.convId] || 0, msg.ts);
    this.metaFile.save();
    this.saveConv(msg.convId);
  }

  // --------------------------------------------------------------- lifecycle

  async start() {
    this.server = http.createServer((req, res) => {
      this.handleHttp(req, res).catch((err) => {
        if (!res.headersSent) sendJson(res, 500, { error: err.message });
        else res.destroy();
      });
    });
    this.server.keepAliveTimeout = 30000;
    this.port = await this.listen(this.preferredPort);
    this.codePack();

    if (this.enableDiscovery) {
      this.discovery = new Discovery({ port: this.discoveryPort, getBeacon: () => this.publicProfile() });
      this.discovery.on('beacon', (data, ip) => this.onBeacon(data, ip));
      this.discovery.on('error', (err) => this.emit('log', `Discovery: ${err.message}`));
      await this.discovery.start();
      if (process.platform === 'darwin') {
        this.bonjour = new BonjourDiscovery({ httpPort: this.port, peerId: this.me.id, peerName: this.me.name });
        this.bonjour.on('peer', (hint) => {
          this.emit('log', `Bonjour found ${hint.ip}:${hint.port}`);
          this.helloPeer({ id: `mdns:${hint.ip}:${hint.port}`, ip: hint.ip, port: hint.port, ips: [hint.ip] });
        });
        this.bonjour.on('error', (err) => this.emit('log', `Bonjour: ${err.message}`));
        this.bonjour.start();
      }
      this.timers.push(setTimeout(() => this.probeLan().catch(() => {}), 800));
      this.timers.push(setTimeout(() => this.probeLan().catch(() => {}), 1500));
      this.timers.push(setTimeout(() => this.probeLan().catch(() => {}), 4000));
      this.timers.push(setTimeout(() => this.probeLan().catch(() => {}), 8000));
      this.timers.push(setInterval(() => this.probeLan().catch(() => {}), process.platform === 'darwin' ? 12000 : 60000));
    }

    this.timers.push(setInterval(() => this.presenceTick(), this.presenceInterval));
    this.timers.push(setInterval(() => this.syncKnownPeers(), Math.max(2000, this.presenceInterval)));
    this.syncKnownPeers();
    return this.port;
  }

  listen(port, attempt = 0, host = process.platform === 'darwin' ? '::' : '0.0.0.0') {
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        this.server.removeListener('listening', onListening);
        if ((err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL') && host === '::') {
          resolve(this.listen(port, attempt, '0.0.0.0'));
          return;
        }
        if (err.code === 'EADDRINUSE' && attempt < 30) resolve(this.listen(port + 1, attempt + 1, host));
        else reject(err);
      };
      const onListening = () => {
        this.server.removeListener('error', onError);
        const addr = this.server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : port);
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen({ port, host, ipv6Only: false });
    });
  }

  async stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const job of this.downloads.values()) {
      job.cancelled = true;
      job.req?.destroy();
    }
    this.bonjour?.stop();
    this.bonjour = null;
    this.discovery?.stop();
    const closed = new Promise((r) => (this.server ? this.server.close(() => r()) : r()));
    this.server?.closeAllConnections?.();
    await closed;
    this.flushAll();
  }

  flushAll() {
    for (const f of [this.config, this.peersFile, this.groupsFile, this.outboxFile, this.sharedFile, this.metaFile]) f.flush();
    for (const f of this.convFiles.values()) f.flush();
  }

  // ----------------------------------------------------------------- presence

  publicProfile() {
    const pack = this._codePack || { sha: '', mtime: 0 };
    return {
      app: APP_TAG,
      v: PROTOCOL_VERSION,
      ver: this.appVersion,
      rev: (pack.sha || '').slice(0, 16),
      cts: Math.round(pack.mtime || 0),
      id: this.me.id,
      name: this.me.name,
      color: this.me.color,
      status: this.me.status,
      port: this.port,
      ws: this.workspace,
      ips: localAddresses()
        .map((a) => a.address)
        .slice(0, 12),
    };
  }

  headers() {
    return {
      'x-officelink-peer': this.me.id,
      'x-officelink-ws': encodeURIComponent(this.workspace),
    };
  }

  isOnline(peerId) {
    return Date.now() - (this.seen.get(peerId) || 0) < ONLINE_TIMEOUT;
  }

  touchPeer(info, ip, { manual } = {}) {
    if (!info || typeof info.id !== 'string' || info.id === this.me.id) return null;
    if ((info.ws || '') !== this.workspace) return null;
    const port = Number(info.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    ip = this.bestIp(info, ip);
    if (!ip) return null;

    const peers = this.peersFile.data;
    const existing = peers[info.id];
    const wasOnline = this.isOnline(info.id);
    const firstSeen = !existing;
    const p = existing || { id: info.id };
    const name = String(info.name || 'Unknown').slice(0, 64);
    const changed =
      !existing ||
      p.name !== name ||
      p.color !== info.color ||
      p.status !== info.status ||
      p.ip !== ip ||
      p.port !== port ||
      p.appVersion !== String(info.ver || '') ||
      p.codeSha !== String(info.rev || '');
    const mergedIps = [ip, ...(Array.isArray(info.ips) ? info.ips : []), ...(p.ips || [])]
      .map(cleanIp)
      .filter((x) => isIpv4(x));
    Object.assign(p, {
      name,
      color: typeof info.color === 'string' ? info.color : COLORS[0],
      status: ['online', 'away', 'busy'].includes(info.status) ? info.status : 'online',
      ip,
      port,
      ips: [...new Set(mergedIps)].slice(0, 12),
      ws: info.ws || '',
      lastSeen: Date.now(),
      appVersion: String(info.ver || '').slice(0, 32),
      feedVersion: String(info.feed || p.feedVersion || '').slice(0, 32),
      codeSha: String(info.rev || '').slice(0, 64),
      codeTime: Number(info.cts) || 0,
      sharingUpdates: true,
    });
    if (manual) p.manual = true;
    peers[info.id] = p;
    this.seen.set(info.id, Date.now());
    this.peersFile.save();

    if (firstSeen) {
      this.notePeerJoined(p);
      this.introducePeer(p);
    }
    if (!wasOnline) this.flushOutbox(info.id);
    if (changed || !wasOnline || firstSeen) this.emitState();
    return p;
  }

  bestIp(info, fromIp) {
    fromIp = cleanIp(fromIp);
    if (fromIp && /^\d{1,3}(\.\d{1,3}){3}$/.test(fromIp)) return fromIp;
    const mine = localAddresses().map((a) => a.address);
    const raw = [info?.ip, ...(Array.isArray(info?.ips) ? info.ips : [])]
      .map(cleanIp)
      .filter((ip) => ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip));
    const unique = [...new Set(raw)].filter(isIpv4);
    unique.sort((a, b) => Number(reachableOn(b)) - Number(reachableOn(a)) || Number(sameSubnet(mine[0], b)) - Number(sameSubnet(mine[0], a)));
    return unique[0] || null;
  }

  notePeerJoined(p) {
    if (!p?.id || this.notedJoins.has(p.id)) return;
    this.notedJoins.add(p.id);
    const name = p.name || 'Someone';
    this.addSystemMessage('general', `${name} joined`);
    const visible = this.focused && this.activeConv === 'general';
    if (!visible) {
      this.metaFile.data.unread.general = (this.metaFile.data.unread.general || 0) + 1;
      this.metaFile.save();
    }
    this.emit('notify', { convId: 'general', title: 'OfficeLink', body: `${name} joined`, sound: this.me.status !== 'busy' });
  }

  onBeacon(data, ip) {
    ip = cleanIp(ip);
    if (!data || data.id === this.me.id) return;
    if (data.type === 'bye') {
      if (data.id && this.seen.has(data.id)) {
        this.seen.delete(data.id);
        this.emitState();
      }
      return;
    }
    if (data.type === 'probe' || !data.id) {
      this.discovery?.reply(ip);
      return;
    }
    const wasOnline = this.isOnline(data.id);
    const peer = this.touchPeer(data, ip);
    if (data.type !== 'reply') this.discovery?.reply(ip);
    if (peer && !wasOnline) this.helloPeer(peer);
  }

  presenceTick() {
    const online = Object.keys(this.peersFile.data).filter((id) => this.isOnline(id)).sort().join(',');
    if (online !== this.lastOnline) {
      this.lastOnline = online;
      this.emitState();
    } else if (process.platform === 'darwin') {
      this.emitState();
    }
    for (const id of Object.keys(this.outboxFile.data)) {
      if (this.isOnline(id)) this.flushOutbox(id);
    }
    if (this.discovery) {
      for (const p of Object.values(this.peersFile.data)) {
        for (const ip of new Set([p.ip, ...(p.ips || [])].filter(isIpv4))) this.discovery.unicast(ip);
      }
    }
  }

  async pingManualPeers() {
    await this.syncKnownPeers();
  }

  async syncKnownPeers() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const peers = Object.values(this.peersFile.data).filter((p) => (p.ws || '') === this.workspace && p.ip && p.port);
      await Promise.all(peers.map((p) => this.syncWithPeer(p).catch(() => {})));
    } finally {
      this.syncing = false;
    }
  }

  async syncWithPeer(p, depth = 0) {
    if (!p?.ip || p.id === this.me.id || depth > 40) return;
    const acks = this.pendingAcks.get(p.id) || [];
    const ips = this.orderIps([p.ip, ...(p.ips || [])]);
    let res;
    let usedIp = p.ip;
    let lastErr;
    for (const ip of ips) {
      try {
        res = await this.request(ip, p.port, 'POST', '/api/collect', { profile: this.publicProfile(), acks, peers: this.gossipPeers(p.id) }, 4000);
        usedIp = ip;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (err.status === 404) {
          try {
            res = await this.request(ip, p.port, 'POST', '/api/hello', { profile: this.publicProfile(), peers: this.gossipPeers(p.id) }, 3500);
            usedIp = ip;
            lastErr = null;
            break;
          } catch (err2) {
            lastErr = err2;
          }
        }
      }
    }
    if (!res) throw lastErr || new Error('Peer unreachable');
    if (acks.length) this.pendingAcks.delete(p.id);
    if (res.profile) this.touchPeer(res.profile, usedIp, { manual: !!p.manual });
    this.ingestGossip(res.peers, usedIp);
    const events = Array.isArray(res.events) ? res.events : [];
    const got = [];
    for (const ev of events) {
      try {
        this.handleEvent(p.id, ev);
      } catch (err) {
        this.emit('log', `Bad event from ${p.id}: ${err.message}`);
      }
      if (ev && ev.eid) got.push(ev.eid);
    }
    if (got.length) {
      this.pendingAcks.set(p.id, got);
      await this.syncWithPeer(p, depth + 1);
    }
  }

  async addPeerByAddress(host, port) {
    host = String(host || '').trim();
    port = Number(port) || 45321;
    if (!host) throw new Error('Enter an IP address');
    let res;
    try {
      res = await this.request(host, port, 'POST', '/api/hello', { profile: this.publicProfile() }, 5000);
    } catch (err) {
      if (err.status === 403) throw new Error('That computer uses a different workspace name.');
      throw new Error(`Could not reach ${host}:${port}. Make sure OfficeLink is open there and not blocked by a firewall.`);
    }
    if (res.profile?.id === this.me.id) throw new Error('That address is this computer.');
    const peer = this.touchPeer(res.profile, host, { manual: true });
    if (!peer) throw new Error('That computer uses a different workspace name.');
    this.ingestGossip(res.peers, host);
    this.syncWithPeer(peer).catch(() => {});
    this.emitState();
    return peer;
  }

  removePeer(peerId) {
    delete this.peersFile.data[peerId];
    delete this.outboxFile.data[peerId];
    this.seen.delete(peerId);
    this.notedJoins.delete(peerId);
    this.peersFile.save();
    this.outboxFile.save();
    this.emitState();
  }

  gossipPeers(exceptId) {
    return this.peerList()
      .filter((p) => p.online && p.ip && p.port && p.id !== exceptId)
      .slice(0, 40)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        status: p.status,
        ip: p.ip,
        port: p.port,
        ips: p.ips || [],
        ver: p.appVersion,
        ws: this.workspace,
      }));
  }

  ingestGossip(list, viaIp) {
    if (!Array.isArray(list)) return;
    for (const hint of list) {
      if (!hint || typeof hint.id !== 'string' || hint.id === this.me.id) continue;
      if ((hint.ws || '') !== this.workspace) continue;
      if (this.isOnline(hint.id)) continue;
      const existing = this.peersFile.data[hint.id];
      const ip = cleanIp(hint.ip) || viaIp;
      const port = Number(hint.port) || this.preferredPort;
      if (!ip || !port) continue;
      if (existing?.ip === ip && existing?.port === port && this.helloBusy.has(hint.id)) continue;
      this.helloPeer({ ...hint, ip, port, ips: hint.ips || existing?.ips || [] });
    }
  }

  introducePeer(p) {
    for (const other of Object.values(this.peersFile.data)) {
      if (!other?.ip || other.id === p.id || other.id === this.me.id) continue;
      this.helloPeer(other);
    }
  }

  orderIps(list) {
    return [...new Set((list || []).map(cleanIp).filter(isIpv4))].sort((a, b) => Number(reachableOn(b)) - Number(reachableOn(a)));
  }

  helloPeer(p) {
    if (!p?.ip || p.id === this.me.id) return;
    const key = p.id || `${p.ip}:${p.port}`;
    if (this.helloBusy.has(key)) return;
    this.helloBusy.add(key);
    const tryHello = async () => {
      const ips = this.orderIps([p.ip, ...(p.ips || [])]);
      for (const ip of ips) {
        try {
          const res = await this.request(ip, p.port, 'POST', '/api/hello', { profile: this.publicProfile(), peers: this.gossipPeers(p.id) }, 2500);
          if (res.profile) {
            this.touchPeer(res.profile, ip, { manual: !!p.manual });
            this.ingestGossip(res.peers, ip);
            return;
          }
        } catch {
          // try next advertised address
        }
      }
    };
    tryHello()
      .catch(() => {})
      .finally(() => setTimeout(() => this.helloBusy.delete(key), 2000));
  }

  lanNeighborIps() {
    const ips = [];
    for (const iface of localAddresses()) ips.push(...hostsOnInterface(iface));
    return [...new Set(ips)];
  }

  async probeLan() {
    if (this.scanning || !this.enableDiscovery) return;
    const targets = this.lanNeighborIps();
    if (!targets.length) return;
    this.scanning = true;
    this.emit('log', `Scanning Wi-Fi and LAN for OfficeLink (${targets.length} addresses)`);
    const ports = [...new Set([this.port, this.preferredPort, 45321, 45322])].filter(Boolean);
    const concurrency = 48;
    let next = 0;
    const worker = async () => {
      while (next < targets.length) {
        const ip = targets[next++];
        for (const port of ports) {
          try {
            const res = await this.request(ip, port, 'POST', '/api/hello', { profile: this.publicProfile(), peers: this.gossipPeers() }, 500);
            if (res.profile && res.profile.id !== this.me.id) {
              this.touchPeer(res.profile, ip);
              this.ingestGossip(res.peers, ip);
            }
          } catch {
            // empty
          }
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
    } finally {
      this.scanning = false;
    }
  }

  // --------------------------------------------------------------- transport

  request(host, port, method, pathName, body, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const from = localAddressFor(host);
      const req = http.request(
        {
          hostname: host,
          port,
          method,
          path: pathName,
          family: 4,
          ...(from ? { localAddress: from } : {}),
          headers: {
            ...this.headers(),
            ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            let data = {};
            try {
              data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            } catch {
              // non-JSON response
            }
            if (res.statusCode >= 400) {
              const err = new Error(data.error || `HTTP ${res.statusCode}`);
              err.status = res.statusCode;
              reject(err);
            } else resolve(data);
          });
        }
      );
      req.setTimeout(timeout, () => req.destroy(new Error('Request timed out')));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  recipientsOf(convId) {
    if (convId === 'general') {
      return Object.values(this.peersFile.data)
        .filter((p) => (p.ws || '') === this.workspace)
        .map((p) => p.id);
    }
    if (convId.startsWith('dm:')) return convId.slice(3).split(':').filter((id) => id !== this.me.id);
    const group = this.groupsFile.data[convId];
    if (!group || group.left) return [];
    return group.members.filter((id) => id !== this.me.id);
  }

  dispatch(convId, event, recipients = this.recipientsOf(convId)) {
    event.eid = event.eid || uid();
    event.convId = convId;
    if (convId.startsWith('group:') && this.groupsFile.data[convId]) {
      const { left, ...group } = this.groupsFile.data[convId];
      event.group = { ...group, members: [...group.members] };
    }
    for (const pid of recipients) {
      const box = (this.outboxFile.data[pid] ||= []);
      box.push(event);
      if (box.length > OUTBOX_LIMIT) box.splice(0, box.length - OUTBOX_LIMIT);
    }
    this.outboxFile.save();
    for (const pid of recipients) {
      const peer = this.peersFile.data[pid];
      if (peer?.ip) this.flushOutbox(pid);
    }
  }

  async flushOutbox(pid) {
    if (this.flushing.has(pid)) return;
    const peer = this.peersFile.data[pid];
    if (!peer || !peer.ip) return;
    this.flushing.add(pid);
    try {
      for (;;) {
        const box = this.outboxFile.data[pid];
        if (!box || !box.length) {
          delete this.outboxFile.data[pid];
          break;
        }
        const batch = box.slice(0, BATCH_SIZE);
        const res = await this.request(peer.ip, peer.port, 'POST', '/api/events', {
          from: this.publicProfile(),
          events: batch,
        });
        const acked = new Set(Array.isArray(res.acks) ? res.acks : batch.map((e) => e.eid));
        this.outboxFile.data[pid] = (this.outboxFile.data[pid] || []).filter((e) => !acked.has(e.eid));
        this.outboxFile.save();
        for (const e of batch) if (acked.has(e.eid)) this.onDelivered(pid, e);
        if (!acked.size) break;
      }
    } catch {
      // Peer not reachable right now; the presence loop retries.
    } finally {
      this.flushing.delete(pid);
    }
  }

  onDelivered(pid, e) {
    if (e.type !== 'msg') return;
    const msg = this.findMessage(e.convId, e.message.id);
    if (!msg) return;
    msg.deliveredTo ||= [];
    if (!msg.deliveredTo.includes(pid)) {
      msg.deliveredTo.push(pid);
      this.saveConv(e.convId);
      this.emitMessages(e.convId, [msg]);
    }
  }

  sendEphemeral(convId, event) {
    event.convId = convId;
    for (const pid of this.recipientsOf(convId)) {
      const peer = this.peersFile.data[pid];
      if (!peer?.ip) continue;
      this.request(peer.ip, peer.port, 'POST', '/api/events', { from: this.publicProfile(), events: [event] }, 3000).catch(
        () => {}
      );
    }
  }

  // --------------------------------------------------------------- HTTP server

  async handleHttp(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname.startsWith('/updates/')) {
      return this.serveUpdate(req, res, url.pathname);
    }
    const ws = decodeURIComponent(req.headers['x-officelink-ws'] || '');
    if (ws !== this.workspace) return sendJson(res, 403, { error: 'Workspace mismatch' });
    const ip = cleanIp(req.socket.remoteAddress);

    if (req.method === 'POST' && url.pathname === '/api/hello') {
      const body = await readJsonBody(req);
      this.touchPeer(body.profile, ip);
      this.ingestGossip(body.peers, ip);
      return sendJson(res, 200, { profile: this.publicProfile(), peers: this.gossipPeers(body.profile?.id) });
    }

    if (req.method === 'POST' && url.pathname === '/api/collect') {
      const body = await readJsonBody(req);
      const from = body.profile || body.from;
      if (!from || typeof from.id !== 'string') return sendJson(res, 400, { error: 'Missing sender' });
      this.touchPeer(from, ip);
      this.ingestGossip(body.peers, ip);
      const acked = new Set(Array.isArray(body.acks) ? body.acks : []);
      if (acked.size && this.outboxFile.data[from.id]) {
        const kept = this.outboxFile.data[from.id].filter((e) => !acked.has(e.eid));
        if (kept.length) this.outboxFile.data[from.id] = kept;
        else delete this.outboxFile.data[from.id];
        this.outboxFile.save();
        for (const eid of acked) {
          const orig = this.lastCollected.get(`${from.id}:${eid}`);
          if (orig) {
            this.onDelivered(from.id, orig);
            this.lastCollected.delete(`${from.id}:${eid}`);
          }
        }
      }
      const events = (this.outboxFile.data[from.id] || []).slice(0, BATCH_SIZE);
      for (const e of events) this.lastCollected.set(`${from.id}:${e.eid}`, e);
      return sendJson(res, 200, { profile: this.publicProfile(), events, peers: this.gossipPeers(from.id) });
    }

    if (req.method === 'POST' && url.pathname === '/api/events') {
      const body = await readJsonBody(req);
      const from = body.from;
      if (!from || typeof from.id !== 'string') return sendJson(res, 400, { error: 'Missing sender' });
      this.touchPeer(from, ip);
      const acks = [];
      for (const ev of Array.isArray(body.events) ? body.events : []) {
        try {
          this.handleEvent(from.id, ev);
        } catch (err) {
          this.emit('log', `Bad event from ${from.id}: ${err.message}`);
        }
        if (ev && ev.eid) acks.push(ev.eid);
      }
      return sendJson(res, 200, { acks });
    }

    const fileMatch = req.method === 'GET' && url.pathname.match(/^\/files\/([\w-]+)$/);
    if (fileMatch) return this.serveFile(req, res, fileMatch[1]);

    return sendJson(res, 404, { error: 'Not found' });
  }

  canAccess(convId, peerId) {
    if (!peerId) return false;
    if (convId === 'general') return true;
    return this.recipientsOf(convId).includes(peerId);
  }

  async serveFile(req, res, fileId) {
    const entry = this.sharedFile.data[fileId];
    if (!entry) return sendJson(res, 404, { error: 'File not shared' });
    if (!this.canAccess(entry.convId, req.headers['x-officelink-peer'])) return sendJson(res, 403, { error: 'Access denied' });
    let stat;
    try {
      stat = await fsp.stat(entry.path);
    } catch {
      return sendJson(res, 410, { error: 'File was moved or deleted' });
    }
    const size = stat.size;
    let start = 0;
    let end = size - 1;
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), size - 1);
      if (start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
    }
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Length': size === 0 ? 0 : end - start + 1,
      'Accept-Ranges': 'bytes',
    };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (size === 0) return res.end();
    pipeline(fs.createReadStream(entry.path, { start, end, highWaterMark: CHUNK }), res, () => {});
  }

  resolvedFeedDir() {
    const chosen = (this.settings.updateFeedDir || '').trim();
    const candidates = [
      chosen,
      ...this.defaultFeedDirs,
      path.join(this.dataDir, 'update-feed'),
    ].filter(Boolean);
    for (const dir of candidates) {
      try {
        if (fs.existsSync(path.join(dir, 'latest.json'))) return dir;
      } catch {
        // skip
      }
    }
    return chosen || this.defaultFeedDirs[0] || path.join(this.dataDir, 'update-feed');
  }

  feedVersion() {
    try {
      const raw = fs.readFileSync(path.join(this.resolvedFeedDir(), 'latest.json'), 'utf8');
      const ver = JSON.parse(raw).version;
      return typeof ver === 'string' ? ver : null;
    } catch {
      return null;
    }
  }

  codePack() {
    const now = Date.now();
    if (this._codePack && now - (this._codePackAt || 0) < 30000) return this._codePack;
    try {
      this._codePack = collectSource(this.codeRoot);
    } catch (err) {
      this._codePack = { version: this.appVersion, sha: '', files: {}, mtime: 0, error: err.message };
    }
    this._codePackAt = now;
    return this._codePack;
  }

  async serveUpdate(req, res, pathname) {
    const name = path.basename(decodeURIComponent(pathname.replace(/^\/updates\/?/, '') || 'latest.json'));
    if (name === 'code.json') return sendJson(res, 200, this.codePack());
    if (!this.settings.shareUpdates) return sendJson(res, 404, { error: 'This computer is not sharing updates' });
    const dir = path.resolve(this.resolvedFeedDir());
    if (!name || name.startsWith('.')) return sendJson(res, 400, { error: 'Bad path' });
    const file = path.resolve(dir, name);
    const rel = path.relative(dir, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return sendJson(res, 403, { error: 'Access denied' });
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      return sendJson(res, 404, { error: 'Update file not found' });
    }
    if (!stat.isFile()) return sendJson(res, 404, { error: 'Update file not found' });
    const size = stat.size;
    let start = 0;
    let end = size - 1;
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), size - 1);
      if (start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
    }
    const type = name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Content-Length': size === 0 ? 0 : end - start + 1,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (size === 0) return res.end();
    pipeline(fs.createReadStream(file, { start, end, highWaterMark: CHUNK }), res, () => {});
  }

  // ----------------------------------------------------------- inbound events

  resolveConv(fromId, ev) {
    const convId = ev.convId;
    if (typeof convId !== 'string') return false;
    if (convId === 'general') return true;
    if (convId.startsWith('dm:')) return convId === dmId(this.me.id, fromId);
    if (convId.startsWith('group:')) {
      if (ev.group && ev.group.id === convId) this.upsertGroup(ev.group, fromId);
      const g = this.groupsFile.data[convId];
      return !!g && !g.left && g.members.includes(fromId);
    }
    return false;
  }

  handleEvent(fromId, ev) {
    if (!ev || typeof ev !== 'object') return;
    if (!this.resolveConv(fromId, ev)) return;
    const convId = ev.convId;
    switch (ev.type) {
      case 'msg':
        return this.onRemoteMessage(fromId, convId, ev.message);
      case 'edit': {
        const m = this.findMessage(convId, ev.msgId);
        if (!m || m.from !== fromId || m.deleted) return;
        m.text = String(ev.text || '').slice(0, MAX_TEXT);
        m.edited = Date.now();
        this.saveConv(convId);
        return this.emitMessages(convId, [m]);
      }
      case 'delete': {
        const m = this.findMessage(convId, ev.msgId);
        if (!m || m.from !== fromId) return;
        if (m.file) this.cancelDownload(m.file.id);
        Object.assign(m, { deleted: true, text: '', file: null, reactions: {}, replyTo: null });
        this.saveConv(convId);
        return this.emitMessages(convId, [m]);
      }
      case 'react': {
        const m = this.findMessage(convId, ev.msgId);
        if (!m || typeof ev.emoji !== 'string' || ev.emoji.length > 16) return;
        this.applyReaction(m, ev.emoji, fromId, !!ev.add);
        this.saveConv(convId);
        return this.emitMessages(convId, [m]);
      }
      case 'read': {
        const upTo = Number(ev.upTo) || 0;
        const changed = [];
        for (const m of this.getConv(convId)) {
          if (m.from !== this.me.id || m.ts > upTo) continue;
          m.readBy ||= [];
          if (!m.readBy.includes(fromId)) {
            m.readBy.push(fromId);
            changed.push(m);
          }
        }
        if (changed.length) {
          this.saveConv(convId);
          this.emitMessages(convId, changed);
        }
        return;
      }
      case 'typing':
        return this.emit('typing', { convId, userId: fromId });
      case 'fileDone': {
        const m = this.findMessage(convId, ev.msgId);
        if (!m || m.from !== this.me.id || !m.file) return;
        m.file.downloadedBy ||= [];
        if (!m.file.downloadedBy.includes(fromId)) m.file.downloadedBy.push(fromId);
        this.saveConv(convId);
        return this.emitMessages(convId, [m]);
      }
      case 'group':
        return;
      default:
    }
  }

  applyReaction(m, emoji, userId, add) {
    m.reactions ||= {};
    const list = new Set(m.reactions[emoji] || []);
    if (add) list.add(userId);
    else list.delete(userId);
    if (list.size) m.reactions[emoji] = [...list];
    else delete m.reactions[emoji];
  }

  onRemoteMessage(fromId, convId, raw) {
    if (!raw || typeof raw.id !== 'string') return;
    if (this.findMessage(convId, raw.id)) return;
    const msg = {
      id: raw.id,
      convId,
      from: fromId,
      ts: Number(raw.ts) || Date.now(),
      text: String(raw.text || '').slice(0, MAX_TEXT),
      replyTo: raw.replyTo
        ? {
            id: String(raw.replyTo.id || ''),
            from: String(raw.replyTo.from || ''),
            text: String(raw.replyTo.text || '').slice(0, 300),
          }
        : null,
      file: null,
      reactions: {},
      mentions: Array.isArray(raw.mentions) ? raw.mentions.filter((id) => typeof id === 'string').slice(0, 50) : [],
      forwarded: raw.forwarded && typeof raw.forwarded === 'object'
        ? { from: String(raw.forwarded.from || ''), name: String(raw.forwarded.name || '').slice(0, 64) }
        : null,
    };
    if (raw.file && typeof raw.file.id === 'string' && /^[\w-]+$/.test(raw.file.id)) {
      msg.file = {
        id: raw.file.id,
        name: safeFileName(raw.file.name),
        size: Math.max(0, Number(raw.file.size) || 0),
        thumb: typeof raw.file.thumb === 'string' && raw.file.thumb.startsWith('data:image/') ? raw.file.thumb : null,
        state: 'available',
      };
    }
    this.insertMessage(msg);

    const visible = this.focused && this.activeConv === convId;
    if (!visible) {
      this.metaFile.data.unread[convId] = (this.metaFile.data.unread[convId] || 0) + 1;
      this.metaFile.save();
    }
    this.emitMessages(convId, [msg], true);
    this.emitState();
    if (visible) this.markRead(convId);
    else this.notifyIncoming(convId, fromId, msg);

    if (msg.file && msg.file.size <= (Number(this.settings.autoDownloadMB) || 0) * 1024 * 1024) {
      this.downloadFile(convId, msg.id);
    }
  }

  upsertGroup(g, fromId) {
    if (!g || typeof g.id !== 'string' || !g.id.startsWith('group:') || !Array.isArray(g.members)) return;
    const existing = this.groupsFile.data[g.id];
    if (existing && (existing.updatedAt || 0) >= (g.updatedAt || 0)) return;
    const wasMember = existing && !existing.left;
    const members = [...new Set(g.members.filter((m) => typeof m === 'string'))];
    const isMember = members.includes(this.me.id);
    this.groupsFile.data[g.id] = {
      id: g.id,
      name: String(g.name || 'Group').slice(0, 80),
      members,
      createdBy: g.createdBy,
      updatedAt: Number(g.updatedAt) || Date.now(),
      left: !isMember,
    };
    this.groupsFile.save();
    if (isMember && !wasMember) {
      const who = this.peersFile.data[fromId]?.name || 'Someone';
      this.addSystemMessage(g.id, `${who} added you to "${this.groupsFile.data[g.id].name}"`);
    } else if (!isMember && wasMember) {
      this.addSystemMessage(g.id, 'You were removed from this group');
    }
    this.emitState();
  }

  addSystemMessage(convId, text) {
    const msg = { id: uid(), convId, from: 'system', system: true, ts: Date.now(), text, reactions: {} };
    this.insertMessage(msg);
    this.emitMessages(convId, [msg], true);
  }

  // ------------------------------------------------------------ outbound API

  wire(msg) {
    return {
      id: msg.id,
      convId: msg.convId,
      ts: msg.ts,
      text: msg.text,
      replyTo: msg.replyTo,
      file: msg.file ? { id: msg.file.id, name: msg.file.name, size: msg.file.size, thumb: msg.file.thumb } : null,
      mentions: Array.isArray(msg.mentions) ? msg.mentions.filter((id) => typeof id === 'string').slice(0, 50) : [],
      forwarded: msg.forwarded || null,
    };
  }

  replySnippet(convId, replyToId) {
    const m = replyToId && this.findMessage(convId, replyToId);
    if (!m || m.deleted) return null;
    return { id: m.id, from: m.from, text: (m.text || (m.file ? `📎 ${m.file.name}` : '')).slice(0, 300) };
  }

  checkConv(convId) {
    if (convId === 'general') return;
    if (convId.startsWith('dm:') && convId.includes(this.me.id)) return;
    if (convId.startsWith('group:') && this.groupsFile.data[convId] && !this.groupsFile.data[convId].left) return;
    throw new Error('Unknown conversation');
  }

  parseMentions(text) {
    const found = new Set();
    const names = [{ id: this.me.id, name: this.me.name }, ...Object.values(this.peersFile.data)];
    const sorted = names
      .filter((p) => p && p.name)
      .sort((a, b) => String(b.name).length - String(a.name).length);
    const lower = String(text || '');
    for (const p of sorted) {
      const re = new RegExp(`@(?:${escapeRegExp(p.name)})\\b`, 'i');
      if (re.test(lower)) found.add(p.id);
    }
    return [...found];
  }

  sendText(convId, text, replyToId, extra = {}) {
    this.checkConv(convId);
    text = String(text || '').trim().slice(0, MAX_TEXT);
    if (!text) return null;
    const msg = {
      id: uid(),
      convId,
      from: this.me.id,
      ts: Date.now(),
      text,
      replyTo: this.replySnippet(convId, replyToId),
      file: null,
      reactions: {},
      deliveredTo: [],
      readBy: [],
      mentions: this.parseMentions(text),
      forwarded: extra.forwarded || null,
    };
    this.insertMessage(msg);
    this.emitMessages(convId, [msg], true);
    this.dispatch(convId, { type: 'msg', message: this.wire(msg) });
    this.emitState();
    return msg;
  }

  async sendFiles(convId, filePaths, replyToId) {
    this.checkConv(convId);
    const sent = [];
    for (const p of filePaths || []) {
      let stat;
      try {
        stat = await fsp.stat(p);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const fileId = uid();
      let thumb = null;
      if (this.makeThumbnail && THUMB_EXT.has(path.extname(p).toLowerCase())) {
        try {
          thumb = await this.makeThumbnail(p);
        } catch {
          thumb = null;
        }
      }
      this.sharedFile.data[fileId] = { path: p, name: path.basename(p), size: stat.size, convId };
      this.sharedFile.save();
      this.fileIndex.set(fileId, p);
      const msg = {
        id: uid(),
        convId,
        from: this.me.id,
        ts: Date.now(),
        text: '',
        replyTo: sent.length === 0 ? this.replySnippet(convId, replyToId) : null,
        file: { id: fileId, name: path.basename(p), size: stat.size, thumb, localPath: p, state: 'done', downloadedBy: [] },
        reactions: {},
        deliveredTo: [],
        readBy: [],
      };
      this.insertMessage(msg);
      this.emitMessages(convId, [msg], true);
      this.dispatch(convId, { type: 'msg', message: this.wire(msg) });
      sent.push(msg);
    }
    this.emitState();
    return sent.length;
  }

  async sendBuffer(convId, name, data) {
    const dir = path.join(this.dataDir, 'sent');
    await fsp.mkdir(dir, { recursive: true });
    const file = await uniquePath(dir, safeFileName(name));
    await fsp.writeFile(file, Buffer.from(data));
    return this.sendFiles(convId, [file]);
  }

  editMessage(convId, msgId, text) {
    const m = this.findMessage(convId, msgId);
    text = String(text || '').trim().slice(0, MAX_TEXT);
    if (!m || m.from !== this.me.id || m.deleted || m.file || !text) return;
    m.text = text;
    m.edited = Date.now();
    this.saveConv(convId);
    this.emitMessages(convId, [m]);
    this.dispatch(convId, { type: 'edit', msgId, text });
  }

  deleteMessage(convId, msgId) {
    const m = this.findMessage(convId, msgId);
    if (!m) return;
    if (m.from !== this.me.id) {
      // Messages from others can only be removed from this computer.
      const list = this.getConv(convId);
      list.splice(list.indexOf(m), 1);
      this.saveConv(convId);
      this.emit('removed', { convId, msgId });
      return;
    }
    if (m.file) {
      delete this.sharedFile.data[m.file.id];
      this.sharedFile.save();
    }
    Object.assign(m, { deleted: true, text: '', file: null, reactions: {}, replyTo: null });
    this.saveConv(convId);
    this.emitMessages(convId, [m]);
    this.dispatch(convId, { type: 'delete', msgId });
  }

  react(convId, msgId, emoji) {
    const m = this.findMessage(convId, msgId);
    if (!m || m.deleted || m.system) return;
    const add = !(m.reactions?.[emoji] || []).includes(this.me.id);
    this.applyReaction(m, emoji, this.me.id, add);
    this.saveConv(convId);
    this.emitMessages(convId, [m]);
    this.dispatch(convId, { type: 'react', msgId, emoji, add });
  }

  typing(convId) {
    this.sendEphemeral(convId, { type: 'typing' });
  }

  markRead(convId) {
    const meta = this.metaFile.data;
    if (meta.unread[convId]) {
      meta.unread[convId] = 0;
      this.metaFile.save();
      this.emitState();
    }
    const list = this.convs.get(convId) || [];
    let latest = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].from !== this.me.id && !list[i].system) {
        latest = list[i].ts;
        break;
      }
    }
    if (latest && (meta.readSent[convId] || 0) < latest) {
      meta.readSent[convId] = latest;
      this.metaFile.save();
      this.dispatch(convId, { type: 'read', upTo: latest });
    }
  }

  setActive(convId, focused) {
    this.activeConv = convId;
    this.focused = focused;
    if (convId && focused) this.markRead(convId);
  }

  createGroup(name, memberIds) {
    name = String(name || '').trim().slice(0, 80);
    if (!name) throw new Error('Group name is required');
    const id = `group:${uid()}`;
    const members = [...new Set([this.me.id, ...(memberIds || [])])];
    this.groupsFile.data[id] = { id, name, members, createdBy: this.me.id, updatedAt: Date.now(), left: false };
    this.groupsFile.save();
    this.addSystemMessage(id, `You created "${name}"`);
    this.dispatch(id, { type: 'group' });
    this.emitState();
    return id;
  }

  updateGroup(id, { name, members }) {
    const g = this.groupsFile.data[id];
    if (!g || g.left) throw new Error('Unknown group');
    const before = g.members;
    if (name && name.trim()) g.name = name.trim().slice(0, 80);
    if (Array.isArray(members)) g.members = [...new Set([this.me.id, ...members])];
    g.updatedAt = Date.now();
    this.groupsFile.save();
    const everyone = [...new Set([...before, ...g.members])].filter((m) => m !== this.me.id);
    this.dispatch(id, { type: 'group' }, everyone);
    this.emitState();
  }

  leaveGroup(id) {
    const g = this.groupsFile.data[id];
    if (!g) return;
    const others = g.members.filter((m) => m !== this.me.id);
    g.members = others;
    g.updatedAt = Date.now();
    this.dispatch(id, { type: 'group' }, others);
    g.left = true;
    this.groupsFile.save();
    this.emitState();
  }

  notifyIncoming(convId, fromId, msg) {
    const muted = (this.metaFile.data.muted || []).includes(convId);
    const mentioned = (msg.mentions || []).includes(this.me.id);
    if (muted && !mentioned) return;
    if (this.me.status === 'busy' && !mentioned) return;
    if (!this.settings.notifications && !mentioned) return;
    const sender = this.peersFile.data[fromId]?.name || 'Someone';
    const where = convId === 'general' ? ' in #general' : convId.startsWith('group:') ? ` in ${this.groupsFile.data[convId]?.name}` : '';
    this.emit('notify', {
      convId,
      title: mentioned ? `${sender} mentioned you${where}` : `${sender}${where}`,
      body: msg.file ? `Sent a file: ${msg.file.name}` : msg.text.slice(0, 200),
      sound: this.me.status !== 'busy',
    });
  }

  togglePin(convId) {
    this.checkConv(convId);
    const list = this.metaFile.data.pinned;
    const i = list.indexOf(convId);
    if (i >= 0) list.splice(i, 1);
    else list.unshift(convId);
    this.metaFile.save();
    this.emitState();
    return i < 0;
  }

  toggleMute(convId) {
    this.checkConv(convId);
    const list = this.metaFile.data.muted;
    const i = list.indexOf(convId);
    if (i >= 0) list.splice(i, 1);
    else list.push(convId);
    this.metaFile.save();
    this.emitState();
    return i < 0;
  }

  async forwardMessage(fromConv, msgId, toConv) {
    this.checkConv(fromConv);
    this.checkConv(toConv);
    const m = this.findMessage(fromConv, msgId);
    if (!m || m.deleted || m.system) throw new Error('That message cannot be forwarded');
    const forwarded = { from: m.from, name: m.from === this.me.id ? this.me.name : this.peersFile.data[m.from]?.name || 'Unknown' };
    if (m.file) {
      const p = this.localPathFor(m.file.id);
      if (!p) throw new Error('Download the file first, then you can forward it');
      return this.sendFiles(toConv, [p]);
    }
    if (!m.text) throw new Error('Nothing to forward');
    return this.sendText(toConv, m.text, null, { forwarded });
  }

  updateProfile({ name, status, color }) {
    const p = this.me;
    if (typeof name === 'string' && name.trim()) p.name = name.trim().slice(0, 64);
    if (['online', 'away', 'busy'].includes(status)) p.status = status;
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) p.color = color;
    this.config.data.onboarded = true;
    this.config.save();
    this.discovery?.announce();
    this.syncKnownPeers();
    this.emitState();
  }

  updateSettings(patch) {
    const s = this.settings;
    const wsBefore = this.workspace;
    for (const key of ['downloadDir', 'theme', 'workspace', 'updateFeedDir', 'updateRepo', 'updateBranch']) if (typeof patch[key] === 'string') s[key] = patch[key];
    for (const key of ['notifications', 'runInBackground', 'autoUpdate', 'shareUpdates']) if (typeof patch[key] === 'boolean') s[key] = patch[key];
    if (patch.autoDownloadMB !== undefined) s.autoDownloadMB = Math.max(0, Number(patch.autoDownloadMB) || 0);
    this.config.save();
    if (this.workspace !== wsBefore) {
      this.seen.clear();
      this.discovery?.announce();
    } else {
      this.discovery?.announce();
    }
    this.emitState();
  }

  // ---------------------------------------------------------------- downloads

  downloadFile(convId, msgId) {
    const msg = this.findMessage(convId, msgId);
    if (!msg || !msg.file || msg.from === this.me.id) return;
    const f = msg.file;
    if (this.downloads.has(f.id)) return;
    if (!this.isOnline(msg.from)) {
      f.state = 'failed';
      f.error = 'The sender is offline. Try again when they are online.';
      this.saveConv(convId);
      this.emitMessages(convId, [msg]);
      return;
    }
    const job = { convId, msgId, fileId: f.id, cancelled: false, req: null };
    this.downloads.set(f.id, job);
    f.state = 'downloading';
    f.error = null;
    this.emitMessages(convId, [msg]);
    this.runDownload(job, msg).catch((err) => this.emit('log', `Download error: ${err.message}`));
  }

  async runDownload(job, msg) {
    const f = msg.file;
    const dir = this.settings.downloadDir;
    const tmpDir = path.join(dir, '.officelink-partial');
    const partPath = path.join(tmpDir, `${f.id}.part`);
    let lastErr = null;
    try {
      await fsp.mkdir(tmpDir, { recursive: true });
      for (let attempt = 0; attempt < 5 && !job.cancelled; attempt++) {
        try {
          await this.fetchToFile(job, msg, partPath);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (job.cancelled || err.fatal) break;
          await sleep(1500 * (attempt + 1));
        }
      }
      if (!job.cancelled && !lastErr) {
        const finalPath = await uniquePath(dir, f.name);
        await fsp.rename(partPath, finalPath);
        f.state = 'done';
        f.localPath = finalPath;
        f.error = null;
        this.fileIndex.set(f.id, finalPath);
        this.dispatch(job.convId, { type: 'fileDone', msgId: msg.id }, [msg.from]);
      }
    } catch (err) {
      lastErr = err;
    }
    this.downloads.delete(f.id);
    if (!msg.file) return;
    if (job.cancelled) {
      f.state = 'available';
      fsp.rm(partPath, { force: true }).catch(() => {});
    } else if (lastErr) {
      f.state = 'failed';
      f.error = lastErr.message;
    }
    this.saveConv(job.convId);
    this.emitMessages(job.convId, [msg]);
  }

  async fetchToFile(job, msg, partPath) {
    const f = msg.file;
    const peer = this.peersFile.data[msg.from];
    if (!peer || !peer.ip) throw Object.assign(new Error('The sender is offline'), { fatal: true });
    let offset = 0;
    try {
      offset = (await fsp.stat(partPath)).size;
    } catch {
      offset = 0;
    }
    if (offset > f.size) {
      await fsp.rm(partPath, { force: true });
      offset = 0;
    }
    if (offset === f.size && f.size > 0) return;

    await new Promise((resolve, reject) => {
      const req = http.get({
        hostname: peer.ip,
        port: peer.port,
        path: `/files/${encodeURIComponent(f.id)}`,
        headers: { ...this.headers(), ...(offset > 0 ? { Range: `bytes=${offset}-` } : {}) },
      });
      job.req = req;
      req.setTimeout(30000, () => req.destroy(new Error('The connection stalled')));
      req.on('error', reject);
      req.on('response', (res) => {
        const code = res.statusCode;
        if (code === 404 || code === 410 || code === 403) {
          res.resume();
          const reason =
            code === 403 ? 'You do not have access to this file' : 'The sender no longer shares this file (moved or deleted)';
          reject(Object.assign(new Error(reason), { fatal: true }));
          return;
        }
        if (code !== 200 && code !== 206) {
          res.resume();
          reject(new Error(`Unexpected response (${code})`));
          return;
        }
        let received = code === 206 ? offset : 0;
        let lastEmit = 0;
        let windowStart = Date.now();
        let windowBytes = 0;
        let speed = 0;
        const emitProgress = (force) => {
          const now = Date.now();
          if (!force && now - lastEmit < 250) return;
          lastEmit = now;
          const elapsed = (now - windowStart) / 1000;
          if (elapsed >= 0.5) {
            speed = windowBytes / elapsed;
            windowStart = now;
            windowBytes = 0;
          }
          f.received = received;
          this.emit('transfer', { convId: job.convId, msgId: msg.id, fileId: f.id, received, total: f.size, speed });
        };
        const counter = new Transform({
          transform: (chunk, _enc, cb) => {
            received += chunk.length;
            windowBytes += chunk.length;
            emitProgress(false);
            cb(null, chunk);
          },
        });
        const out = fs.createWriteStream(partPath, { flags: code === 206 ? 'a' : 'w', highWaterMark: CHUNK });
        pipeline(res, counter, out, (err) => {
          emitProgress(true);
          if (err) return reject(job.cancelled ? new Error('Cancelled') : err);
          if (received < f.size) return reject(new Error('Transfer interrupted'));
          resolve();
        });
      });
    });
  }

  cancelDownload(fileId) {
    const job = this.downloads.get(fileId);
    if (!job) return;
    job.cancelled = true;
    job.req?.destroy();
  }

  localPathFor(fileId) {
    return this.fileIndex.get(fileId) || null;
  }

  // --------------------------------------------------------------- read API

  peerList() {
    return Object.values(this.peersFile.data)
      .filter((p) => (p.ws || '') === this.workspace)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        status: p.status,
        ip: p.ip,
        port: p.port,
        manual: !!p.manual,
        lastSeen: p.lastSeen,
        online: this.isOnline(p.id),
        appVersion: p.appVersion || '',
        feedVersion: p.feedVersion || '',
        codeSha: p.codeSha || '',
        codeTime: p.codeTime || 0,
        sharingUpdates: !!p.sharingUpdates,
      }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  }

  summary(m) {
    if (!m) return null;
    return {
      from: m.from,
      ts: m.ts,
      system: !!m.system,
      text: m.deleted ? 'Message deleted' : m.file ? `📎 ${m.file.name}` : (m.text || '').slice(0, 120),
    };
  }

  getState() {
    const convs = {};
    const ids = new Set([...this.convs.keys(), 'general']);
    for (const id of ids) {
      const list = this.convs.get(id) || [];
      convs[id] = {
        unread: this.metaFile.data.unread[id] || 0,
        last: this.summary(list[list.length - 1]),
        lastActivity: this.metaFile.data.lastActivity[id] || 0,
      };
    }
    return {
      me: { ...this.me },
      onboarded: !!this.config.data.onboarded,
      settings: { ...this.settings },
      port: this.port,
      addresses: localAddresses().map((a) => ({ ip: a.address, name: a.name, kind: a.kind || ifaceKind(a.name) })),
      peers: this.peerList(),
      groups: Object.values(this.groupsFile.data).filter((g) => !g.left),
      pinned: [...(this.metaFile.data.pinned || [])],
      muted: [...(this.metaFile.data.muted || [])],
      convs,
      platform: process.platform,
      lookingForPeers: process.platform === 'darwin' && !this.peerList().some((p) => p.online),
      uptimeMs: Date.now() - this.startedAt,
      appVersion: this.appVersion,
      codeSha: this.codePack().sha,
      feedVersion: this.feedVersion(),
      feedDir: this.resolvedFeedDir(),
    };
  }

  getMessages(convId, { before, fromId, limit = 150 } = {}) {
    const list = this.convs.get(convId) || [];
    let end = list.length;
    if (before) {
      end = list.findIndex((m) => m.id === before);
      if (end < 0) end = list.length;
    }
    let start = Math.max(0, end - limit);
    if (fromId) {
      const idx = list.findIndex((m) => m.id === fromId);
      if (idx >= 0) start = Math.min(start, Math.max(0, idx - 20));
    }
    return { messages: list.slice(start, end).map((m) => this.decorate(m)), hasMore: start > 0 };
  }

  decorate(m) {
    if (!m.file || !this.downloads.has(m.file.id)) return m;
    return { ...m, file: { ...m.file, state: 'downloading' } };
  }

  search(convId, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const list = this.convs.get(convId) || [];
    const results = [];
    for (let i = list.length - 1; i >= 0 && results.length < 100; i--) {
      const m = list[i];
      if (m.deleted || m.system) continue;
      const hay = `${m.text || ''} ${m.file ? m.file.name : ''}`.toLowerCase();
      if (hay.includes(q)) results.push(m);
    }
    return results;
  }

  // ----------------------------------------------------------------- events

  emitMessages(convId, messages, isNew = false) {
    this.emit('messages', { convId, messages: messages.map((m) => this.decorate(m)), isNew });
  }

  emitState() {
    if (this.stateTimer) return;
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      this.emit('state', this.getState());
    }, 60);
  }
}

module.exports = { ChatEngine, dmId, safeFileName, compareVersions };
