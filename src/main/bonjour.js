const { spawn } = require('child_process');
const dns = require('dns');
const os = require('os');
const EventEmitter = require('events');

function lookup4(host) {
  return new Promise((resolve, reject) => {
    dns.lookup(host, { family: 4 }, (err, address) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

/**
 * Uses macOS dns-sd (Bonjour). That is what actually triggers
 * System Settings → Privacy → Local Network, which Node UDP/HTTP often does not.
 */
class BonjourDiscovery extends EventEmitter {
  constructor({ httpPort, peerId, peerName }) {
    super();
    this.httpPort = httpPort;
    this.peerId = peerId;
    this.peerName = String(peerName || os.hostname() || 'OfficeLink').slice(0, 40);
    this.instance = `OfficeLink ${this.peerId.slice(0, 8)}`;
    this.procs = [];
    this.seen = new Set();
  }

  start() {
    if (process.platform !== 'darwin') return;
    this.register();
    this.browse();
  }

  /** Re-browse so people who joined after the first lookup are found. */
  refresh() {
    if (process.platform !== 'darwin') return;
    this.seen.clear();
    this.stop();
    this.start();
  }

  spawn(args, onData) {
    let child;
    try {
      child = spawn('dns-sd', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      this.emit('error', err);
      return null;
    }
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let buf = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) onData(line);
    });
    child.on('error', (err) => this.emit('error', err));
    this.procs.push(child);
    return child;
  }

  register() {
    this.spawn(
      [
        '-R',
        this.instance,
        '_officelink._tcp',
        'local.',
        String(this.httpPort),
        `id=${this.peerId}`,
        `name=${this.peerName.replace(/[=\s]+/g, ' ').slice(0, 40)}`,
      ],
      () => {}
    );
  }

  browse() {
    this.spawn(['-B', '_officelink._tcp', 'local.'], (line) => {
      const m = /\bAdd\b.+\s+_officelink\._tcp\.\s+(.+)\s*$/i.exec(line);
      if (!m) return;
      const instance = m[1].trim();
      if (!instance || instance === this.instance || this.seen.has(instance)) return;
      this.seen.add(instance);
      this.resolve(instance);
    });
  }

  resolve(instance) {
    let got = false;
    const child = this.spawn(['-L', instance, '_officelink._tcp', 'local.'], (line) => {
      if (got) return;
      const reached = /can be reached at\s+(\S+):(\d+)/i.exec(line);
      if (!reached) return;
      got = true;
      const host = reached[1].replace(/\.$/, '');
      const port = Number(reached[2]);
      lookup4(host)
        .then((ip) => {
          if (ip) this.emit('peer', { ip, port, instance });
        })
        .catch(() => {});
      setTimeout(() => {
        try {
          child.kill();
        } catch {
          // ignore
        }
      }, 500);
    });
  }

  stop() {
    for (const p of this.procs) {
      try {
        p.kill();
      } catch {
        // ignore
      }
    }
    this.procs = [];
  }
}

module.exports = { BonjourDiscovery };
