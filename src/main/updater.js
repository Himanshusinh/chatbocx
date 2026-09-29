const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {
  collectSource,
  applyPack,
  parseRepoUrl,
  gitOrigin,
  gitHead,
  gitAvailable,
  gitRemoteSha,
  gitPullFastForward,
  gitClone,
  gitHardReset,
  githubCommitSha,
  fetchGithubPack,
} = require('./codepack');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class AppUpdater {
  constructor({
    engine,
    send,
    showWindow,
    relaunch,
    appVersion,
    packaged,
    codeRoot,
    runtimeDir,
    projectDir,
  }) {
    this.engine = engine;
    this.send = send;
    this.showWindow = showWindow;
    this.relaunch = relaunch;
    this.appVersion = appVersion;
    this.packaged = packaged;
    this.codeRoot = codeRoot;
    this.runtimeDir = runtimeDir;
    this.projectDir = projectDir;
    this.state = { status: 'idle' };
    this.busy = false;
  }

  emit(extra = {}) {
    const local = this.localSource();
    this.state = {
      ...this.state,
      ...extra,
      current: local.version || this.appVersion,
      currentSha: local.sha,
    };
    this.send('update', this.state);
  }

  localSource() {
    try {
      return collectSource(this.codeRoot);
    } catch {
      return { version: this.appVersion, sha: '', files: {} };
    }
  }

  repoInfo() {
    const raw =
      (this.engine.settings.updateRepo || '').trim() ||
      gitOrigin(this.projectDir) ||
      gitOrigin(this.codeRoot) ||
      '';
    const parsed = parseRepoUrl(raw);
    const branch = (this.engine.settings.updateBranch || '').trim() || parsed?.branch || 'master';
    if (!parsed) return raw ? { kind: 'git', clone: raw, branch } : null;
    return { ...parsed, branch: parsed.branch || branch };
  }

  async check({ silent = true } = {}) {
    if (this.busy) return this.state;
    if (!this.engine.settings.autoUpdate && silent) return this.state;
    try {
      const found = await this.findUpdate();
      if (!found) {
        if (!silent) this.emit({ status: 'idle', message: 'You already have the latest code' });
        else if (this.state.status === 'available' || this.state.status === 'error') this.emit({ status: 'idle' });
        return this.state;
      }
      this.emit({
        status: 'available',
        version: found.version || this.appVersion,
        sha: found.sha,
        source: found.source,
        peerName: found.peerName || '',
        message: found.message,
      });
    } catch (err) {
      if (!silent) this.emit({ status: 'error', message: err.message || 'Could not check for updates' });
    }
    return this.state;
  }

  async apply() {
    if (this.busy) return this.state;
    this.busy = true;
    this.emit({ status: 'checking', message: 'Checking for new code…' });
    try {
      const found = await this.findUpdate();
      if (!found) {
        this.emit({ status: 'idle', message: 'You already have the latest code' });
        return this.state;
      }
      this.emit({
        status: 'downloading',
        version: found.version || this.appVersion,
        sha: found.sha,
        source: found.source,
        peerName: found.peerName || '',
        received: 0,
        size: 0,
        message: 'Fetching latest code…',
      });
      await this.installFound(found);
      this.emit({ status: 'restarting', message: 'Restarting with the new code…' });
      this.relaunch();
    } catch (err) {
      this.emit({ status: 'error', message: err.message || 'Update failed' });
    } finally {
      this.busy = false;
    }
    return this.state;
  }

  async findUpdate() {
    const local = this.localSource();
    const repo = this.repoInfo();
    if (repo) {
      return this.probeRepo(repo, local);
    }
    return this.probeLan(local);
  }

  async probeRepo(repo, local) {
    let remoteSha = '';
    if (repo.kind === 'github') {
      try {
        remoteSha = await githubCommitSha(repo.owner, repo.repo, repo.branch);
      } catch {
        if (repo.branch === 'master') {
          try {
            remoteSha = await githubCommitSha(repo.owner, repo.repo, 'main');
            repo = { ...repo, branch: 'main' };
          } catch {
            remoteSha = '';
          }
        }
      }
    }
    if (!remoteSha && (await gitAvailable())) {
      try {
        remoteSha = await gitRemoteSha(repo.clone, repo.branch);
      } catch {
        if (repo.branch === 'master') {
          try {
            remoteSha = await gitRemoteSha(repo.clone, 'main');
            repo = { ...repo, branch: 'main' };
          } catch {
            remoteSha = '';
          }
        }
      }
    }
    const localGit = gitHead(this.codeRoot) || gitHead(this.projectDir);
    if (remoteSha && localGit && remoteSha === localGit) return null;
    if (remoteSha && this.readInstalledRev() === remoteSha) return null;
    if (!remoteSha) throw new Error('Could not reach the git repository');
    return {
      source: 'git',
      repo,
      sha: remoteSha,
      version: local.version,
      message: 'New code is in the git repository',
    };
  }

  async probeLan(local) {
    let best = null;
    for (const p of this.engine.peerList()) {
      if (!p.online || !p.ip || !p.codeSha) continue;
      if (local.sha && (local.sha.startsWith(p.codeSha) || p.codeSha === local.sha.slice(0, 16))) continue;
      if (!best || (p.codeTime || 0) > (best.codeTime || 0)) best = p;
    }
    if (!best) return null;
    const pack = await this.engine.request(best.ip, best.port, 'GET', '/updates/code.json', null, 20000);
    if (!pack?.files || pack.sha === local.sha) return null;
    return {
      source: 'lan',
      pack,
      sha: pack.sha,
      version: pack.version,
      peerName: best.name,
      peerId: best.id,
      message: `New code from ${best.name}`,
    };
  }

  async installFound(found) {
    if (found.source === 'lan') {
      await this.writeRuntime(found.pack);
      return;
    }
    const repo = found.repo;
    const inPlaceGit = !this.packaged && !process.env.OFFICELINK_USING_RUNTIME && fs.existsSync(path.join(this.projectDir, '.git'));
    if (inPlaceGit && (await gitAvailable())) {
      await gitPullFastForward(this.projectDir, repo.branch);
      return;
    }
    if (await gitAvailable()) {
      await this.installViaGit(repo);
      return;
    }
    if (repo.kind === 'github') {
      const pack = await fetchGithubPack(repo, (p) => this.emit({ message: p.message, status: 'downloading' }));
      await this.writeRuntime(pack);
      return;
    }
    throw new Error('Git is not installed, so this computer cannot pull from that repository');
  }

  async installViaGit(repo) {
    const dest = this.runtimeDir;
    if (fs.existsSync(path.join(dest, '.git'))) {
      await gitHardReset(dest, repo.branch);
      await fsp.writeFile(path.join(path.dirname(dest), 'use-runtime'), '1');
      return;
    }
    const staging = `${dest}.staging`;
    await fsp.rm(staging, { recursive: true, force: true });
    await gitClone(repo.clone, staging, repo.branch);
    await this.swapRuntime(staging);
  }

  async writeRuntime(pack) {
    const staging = `${this.runtimeDir}.staging`;
    await fsp.rm(staging, { recursive: true, force: true });
    await fsp.mkdir(staging, { recursive: true });
    applyPack(staging, pack);
    await this.swapRuntime(staging);
  }

  async swapRuntime(staging) {
    const dest = this.runtimeDir;
    const bak = `${dest}.bak`;
    await fsp.rm(bak, { recursive: true, force: true });
    if (fs.existsSync(dest)) await fsp.rename(dest, bak);
    await fsp.rename(staging, dest);
    await fsp.rm(bak, { recursive: true, force: true }).catch(() => {});
    await fsp.writeFile(path.join(path.dirname(dest), 'use-runtime'), '1');
  }

  readInstalledRev() {
    try {
      return fs.readFileSync(path.join(this.runtimeDir, '.officelink-rev'), 'utf8').split('\n')[0].trim();
    } catch {
      return gitHead(this.runtimeDir) || '';
    }
  }

  cancel() {
    this.busy = false;
  }
}

async function startUpdateLoop(updater) {
  const tick = () => updater.check({ silent: true }).catch(() => {});
  await sleep(5000);
  tick();
  return setInterval(tick, 10 * 60 * 1000);
}

module.exports = { AppUpdater, startUpdateLoop };
