const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const TEXT_EXT = new Set([
  '.js',
  '.json',
  '.html',
  '.css',
  '.md',
  '.txt',
  '.svg',
  '.plist',
  '.nsh',
  '.map',
]);

function isAllowedRel(rel) {
  const n = rel.replace(/\\/g, '/');
  if (!n || n.startsWith('/') || n.includes('..')) return false;
  if (n === 'package.json' || n === 'package-lock.json') return true;
  return n.startsWith('src/') && !n.includes('/node_modules/');
}

function walkFiles(dir, base, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walkFiles(full, base, out);
      continue;
    }
    if (!ent.isFile() || !isAllowedRel(rel)) continue;
    out.push(rel);
  }
}

function collectSource(root) {
  const files = {};
  const rels = [];
  walkFiles(path.join(root, 'src'), root, rels);
  for (const extra of ['package.json', 'package-lock.json']) {
    if (fs.existsSync(path.join(root, extra))) rels.push(extra);
  }
  rels.sort();
  const hash = crypto.createHash('sha256');
  let mtime = 0;
  for (const rel of rels) {
    const full = path.join(root, rel);
    const buf = fs.readFileSync(full);
    try {
      mtime = Math.max(mtime, fs.statSync(full).mtimeMs || 0);
    } catch {
      // ignore
    }
    hash.update(rel);
    hash.update('\0');
    hash.update(buf);
    const ext = path.extname(rel).toLowerCase();
    files[rel] = TEXT_EXT.has(ext) ? buf.toString('utf8') : buf.toString('base64');
  }
  let version = '0.0.0';
  try {
    version = JSON.parse(files['package.json'] || '{}').version || version;
  } catch {
    // ignore
  }
  return { version, sha: hash.digest('hex'), files, encoding: 'utf8', mtime };
}

function applyPack(dest, pack) {
  if (!pack || !pack.files || typeof pack.files !== 'object') throw new Error('Invalid code update');
  const written = [];
  for (const [rel, body] of Object.entries(pack.files)) {
    const n = String(rel).replace(/\\/g, '/');
    if (!isAllowedRel(n)) continue;
    const target = path.resolve(dest, n);
    if (!target.startsWith(path.resolve(dest) + path.sep) && path.resolve(dest) !== target) {
      throw new Error('Invalid update path');
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const ext = path.extname(n).toLowerCase();
    if (TEXT_EXT.has(ext)) fs.writeFileSync(target, String(body), 'utf8');
    else fs.writeFileSync(target, Buffer.from(String(body), 'base64'));
    written.push(n);
  }
  if (!written.includes('src/main/main.js') || !written.includes('package.json')) {
    throw new Error('Update is missing app files');
  }
  pruneMissing(path.join(dest, 'src'), dest, new Set(written));
  fs.writeFileSync(path.join(dest, '.officelink-rev'), `${pack.sha || ''}\n${pack.version || ''}\n`);
  return written;
}

function pruneMissing(dir, root, keep) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      pruneMissing(full, root, keep);
      try {
        if (!fs.readdirSync(full).length) fs.rmdirSync(full);
      } catch {
        // ignore
      }
      continue;
    }
    if (!keep.has(rel)) {
      try {
        fs.unlinkSync(full);
      } catch {
        // ignore
      }
    }
  }
}

function parseRepoUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  let branch = '';
  let url = text;
  const tree = text.match(/^(https?:\/\/github\.com\/[^/]+\/[^/]+)\/tree\/([^/?#]+)/i);
  if (tree) {
    url = tree[1];
    branch = decodeURIComponent(tree[2]);
  }
  url = url.replace(/\.git$/i, '');
  const https = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/)?$/i);
  const ssh = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  const m = https || ssh;
  if (m) {
    return {
      kind: 'github',
      owner: m[1],
      repo: m[2].replace(/\.git$/i, ''),
      branch: branch || '',
      clone: `https://github.com/${m[1]}/${m[2].replace(/\.git$/i, '')}.git`,
    };
  }
  return { kind: 'git', clone: text, branch: branch || '', owner: '', repo: '' };
}

function gitOrigin(cwd) {
  try {
    const { stdout } = require('child_process').execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      timeout: 4000,
    });
    return String(stdout || '').trim();
  } catch {
    return '';
  }
}

function gitHead(cwd) {
  try {
    const { stdout } = require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      timeout: 4000,
    });
    return String(stdout || '').trim();
  } catch {
    return '';
  }
}

async function gitAvailable() {
  try {
    await execFileAsync('git', ['--version'], { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

async function gitRemoteSha(clone, branch) {
  const ref = branch ? `refs/heads/${branch}` : 'HEAD';
  const { stdout } = await execFileAsync('git', ['ls-remote', clone, ref], { timeout: 20000, encoding: 'utf8' });
  const line = String(stdout || '')
    .trim()
    .split('\n')
    .find(Boolean);
  if (!line) throw new Error('Could not read the git repository');
  return line.split(/\s+/)[0];
}

async function gitPullFastForward(cwd, branch) {
  await execFileAsync('git', ['fetch', 'origin'], { cwd, timeout: 60000 });
  await execFileAsync('git', ['pull', '--ff-only', 'origin', branch || 'HEAD'], { cwd, timeout: 60000 });
  return gitHead(cwd);
}

async function gitClone(clone, dest, branch) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const args = ['clone', '--depth', '1'];
  if (branch) args.push('--branch', branch);
  args.push(clone, dest);
  await execFileAsync('git', args, { timeout: 120000 });
}

async function gitHardReset(cwd, branch) {
  await execFileAsync('git', ['fetch', 'origin'], { cwd, timeout: 60000 });
  const ref = branch ? `origin/${branch}` : 'origin/HEAD';
  await execFileAsync('git', ['reset', '--hard', ref], { cwd, timeout: 30000 });
  return gitHead(cwd);
}

function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? require('https') : require('http');
    const req = lib.get(
      url,
      {
        headers: { 'User-Agent': 'OfficeLink', Accept: 'application/vnd.github+json' },
        timeout: 30000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          downloadUrl(new URL(res.headers.location, url).href).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Download failed (${res.statusCode})`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Download timed out')));
  });
}

async function githubCommitSha(owner, repo, branch) {
  const url = branch
    ? `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`
    : `https://api.github.com/repos/${owner}/${repo}/commits/HEAD`;
  const buf = await downloadUrl(url);
  const json = JSON.parse(buf.toString('utf8'));
  const sha = json.sha || json.commit?.tree?.sha;
  if (!sha) throw new Error('GitHub did not return a commit');
  return sha;
}

async function extractArchive(zipPath, dest) {
  await fsp.mkdir(dest, { recursive: true });
  if (process.platform === 'win32') {
    await execFileAsync('tar', ['-xf', zipPath, '-C', dest], { timeout: 60000 });
    return;
  }
  try {
    await execFileAsync('unzip', ['-q', '-o', zipPath, '-d', dest], { timeout: 60000 });
  } catch {
    await execFileAsync('tar', ['-xf', zipPath, '-C', dest], { timeout: 60000 });
  }
}

function findPackageRoot(dir) {
  const pkg = path.join(dir, 'package.json');
  if (fs.existsSync(pkg)) return dir;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const nested = findPackageRoot(path.join(dir, ent.name));
    if (nested) return nested;
  }
  return null;
}

async function fetchGithubPack(info, onProgress) {
  const branch = info.branch || 'master';
  const url = `https://codeload.github.com/${info.owner}/${info.repo}/zip/refs/heads/${encodeURIComponent(branch)}`;
  onProgress?.({ message: 'Downloading latest code…' });
  let zip;
  try {
    zip = await downloadUrl(url);
  } catch (err) {
    if (branch === 'master') {
      return fetchGithubPack({ ...info, branch: 'main' }, onProgress);
    }
    throw err;
  }
  const tmp = path.join(require('os').tmpdir(), `officelink-src-${Date.now()}`);
  const zipPath = `${tmp}.zip`;
  await fsp.writeFile(zipPath, zip);
  try {
    await extractArchive(zipPath, tmp);
    const root = findPackageRoot(tmp);
    if (!root) throw new Error('Downloaded update did not contain the app');
    return collectSource(root);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(zipPath, { force: true }).catch(() => {});
  }
}

module.exports = {
  collectSource,
  applyPack,
  isAllowedRel,
  parseRepoUrl,
  gitOrigin,
  gitHead,
  gitAvailable,
  gitRemoteSha,
  gitPullFastForward,
  gitClone,
  gitHardReset,
  downloadUrl,
  githubCommitSha,
  fetchGithubPack,
  findPackageRoot,
};
