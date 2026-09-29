#!/usr/bin/env node
/**
 * Copies built Mac/Windows installers into dist/update-feed so a running
 * OfficeLink can share them with colleagues on the office LAN.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dist = path.join(root, 'dist');
const out = path.join(dist, 'update-feed');

const SLOTS = [
  { key: 'darwin-arm64', name: `OfficeLink-${pkg.version}-mac-arm64.dmg` },
  { key: 'darwin-x64', name: `OfficeLink-${pkg.version}-mac-x64.dmg` },
  { key: 'win32-x64', name: `OfficeLink-Setup-${pkg.version}-win-x64.exe` },
];

function sha512File(file) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(file));
  return hash.digest('base64');
}

if (!fs.existsSync(dist)) {
  console.error('Nothing in dist/. Build first with npm run dist:mac and/or npm run dist:win');
  process.exit(1);
}

fs.mkdirSync(out, { recursive: true });
const files = {};
for (const slot of SLOTS) {
  const src = path.join(dist, slot.name);
  if (!fs.existsSync(src)) {
    console.warn(`skip ${slot.name} (not built)`);
    continue;
  }
  const dest = path.join(out, slot.name);
  fs.copyFileSync(src, dest);
  const stat = fs.statSync(dest);
  files[slot.key] = { file: slot.name, size: stat.size, sha512: sha512File(dest) };
  console.log(`+ ${slot.name} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
}

if (!Object.keys(files).length) {
  console.error('No installers found. Run npm run dist:mac and/or npm run dist:win first.');
  process.exit(1);
}

const manifest = { version: pkg.version, releasedAt: new Date().toISOString(), files };
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(manifest, null, 2));
const keep = new Set(['latest.json', ...Object.values(files).map((f) => f.file)]);
for (const name of fs.readdirSync(out)) {
  if (!keep.has(name)) fs.rmSync(path.join(out, name), { force: true });
}
console.log(`\nUpdate feed ${pkg.version} written to:`);
console.log(`  ${out}`);
console.log('\nKeep OfficeLink open on this computer. Other office PCs on the same Wi-Fi');
console.log('will see the new version and can install it automatically.');
console.log('\nIf this PC already has OfficeLink installed, copy the update-feed folder');
console.log('into Settings → Updates → “Folder with installers”.');
