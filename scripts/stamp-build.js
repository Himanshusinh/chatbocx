#!/usr/bin/env node
/**
 * Records which git commit an installer (.dmg/.exe) is built from, so a fresh
 * install knows whether GitHub has newer code, and so a newer installer wins
 * over older code that an earlier update downloaded.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const sha = git('rev-parse', 'HEAD');
if (git('status', '--porcelain', '--', 'src', 'package.json')) {
  console.warn('⚠ You have uncommitted changes in src/. Commit and push them, or every PC will see this build as out of date.');
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
// --fresh: the first launch after installing clears all previous OfficeLink
// data on that computer (see freshStartForNewInstall in src/main/main.js).
const freshData = process.argv.includes('--fresh');
const info = { sha, version: pkg.version, builtAt: Date.now(), freshData };
fs.writeFileSync(path.join(root, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
console.log(`build-info.json: ${sha.slice(0, 7) || 'no git commit'} (v${pkg.version})${freshData ? ' — FRESH INSTALL: clears old data on first launch' : ''}`);
