const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { collectSource, applyPack, parseRepoUrl, isAllowedRel } = require('../src/main/codepack');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'officelink-update-'));

function writeTree(root, version, body) {
  fs.mkdirSync(path.join(root, 'src', 'main'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'renderer'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'officelink', version }, null, 2));
  fs.writeFileSync(path.join(root, 'src', 'main', 'main.js'), `// ${body}\n`);
  fs.writeFileSync(path.join(root, 'src', 'renderer', 'index.html'), `<p>${body}</p>`);
}

writeTree(path.join(tmp, 'src-a'), '1.2.0', 'hello-a');
const pack = collectSource(path.join(tmp, 'src-a'));
assert.strictEqual(pack.version, '1.2.0');
assert(pack.sha.length === 64);
assert(pack.files['src/main/main.js'].includes('hello-a'));

const dest = path.join(tmp, 'installed');
applyPack(dest, pack);
assert.strictEqual(fs.readFileSync(path.join(dest, 'src', 'renderer', 'index.html'), 'utf8'), '<p>hello-a</p>');
assert.strictEqual(collectSource(dest).sha, pack.sha);

writeTree(path.join(tmp, 'src-b'), '1.2.0', 'hello-b');
const packB = collectSource(path.join(tmp, 'src-b'));
assert.notStrictEqual(pack.sha, packB.sha);
applyPack(dest, packB);
assert(fs.readFileSync(path.join(dest, 'src', 'main', 'main.js'), 'utf8').includes('hello-b'));

assert.strictEqual(isAllowedRel('../etc/passwd'), false);
assert.strictEqual(isAllowedRel('src/main/main.js'), true);
assert.strictEqual(isAllowedRel('package.json'), true);

const gh = parseRepoUrl('https://github.com/acme/officelink.git');
assert.deepStrictEqual(
  { kind: gh.kind, owner: gh.owner, repo: gh.repo, clone: gh.clone },
  {
    kind: 'github',
    owner: 'acme',
    repo: 'officelink',
    clone: 'https://github.com/acme/officelink.git',
  }
);
const tree = parseRepoUrl('https://github.com/acme/officelink/tree/develop');
assert.strictEqual(tree.branch, 'develop');
assert.strictEqual(parseRepoUrl(''), null);

console.log('✓ code pack apply round-trip and git URL parsing');

const {
  onSameNetwork,
  hostsOnInterface,
  isVirtualIface,
  ifaceKind,
  isIpv4,
} = require('../src/main/discovery');

assert.strictEqual(isIpv4('192.168.1.20'), true);
assert.strictEqual(onSameNetwork('192.168.1.50', '192.168.1.10', '255.255.255.0'), true);
assert.strictEqual(onSameNetwork('192.168.0.50', '192.168.1.10', '255.255.255.0'), false);
assert.strictEqual(isVirtualIface('vEthernet (WSL)'), true);
assert.strictEqual(isVirtualIface('Ethernet'), false);
assert.strictEqual(isVirtualIface('Wi-Fi'), false);
assert.strictEqual(isVirtualIface('en0'), false);
assert.strictEqual(ifaceKind('Wi-Fi'), 'Wi-Fi');
assert.strictEqual(ifaceKind('Ethernet'), 'LAN');
const hosts = hostsOnInterface({ address: '192.168.1.10', netmask: '255.255.255.0' });
assert.strictEqual(hosts.length, 253);
assert(!hosts.includes('192.168.1.10'));
assert(hosts.includes('192.168.1.1'));
assert(hosts.includes('192.168.1.20'));
console.log('✓ Wi-Fi and LAN interface helpers');
