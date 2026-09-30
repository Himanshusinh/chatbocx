const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Notification,
  nativeImage,
  protocol,
  net,
  Menu,
  Tray,
  powerMonitor,
  clipboard,
} = require('electron');

const profile = (process.env.OFFICELINK_PROFILE || '').replace(/\W/g, '');
if (profile) app.setPath('userData', `${app.getPath('userData')}-${profile}`);

/**
 * Installers built with `npm run dist:fresh` start with a clean slate: the
 * first launch of that build clears chats, contacts, queues, profile and
 * downloaded updates. Runs once per build (remembered in `fresh-install`), so
 * restarts and `git push` updates never wipe anything. Files saved to the
 * Downloads folder are left alone.
 */
function freshStartForNewInstall() {
  let info;
  try {
    info = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'build-info.json'), 'utf8'));
  } catch {
    return; // Updated code or a dev checkout: never wipe from here.
  }
  if (!info.freshData || !info.builtAt) return;
  const userData = app.getPath('userData');
  const marker = path.join(userData, 'fresh-install');
  try {
    if (fs.readFileSync(marker, 'utf8').trim() === String(info.builtAt)) return;
  } catch {
    // first launch of this build
  }
  for (const name of ['officelink', 'runtime', 'runtime.staging', 'runtime.bak', 'use-runtime', 'auto-update-tried']) {
    try {
      fs.rmSync(path.join(userData, name), { recursive: true, force: true });
    } catch (err) {
      console.error('Could not clear', name, err);
    }
  }
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(marker, String(info.builtAt));
}

freshStartForNewInstall();

/**
 * Runs the code fetched by Settings → Update (userData/runtime) instead of the
 * code bundled in the installer. Decided by which file is executing, not by
 * env vars: app.relaunch() hands the old process's environment to the new
 * one, so an inherited OFFICELINK_USING_RUNTIME used to make the relaunched
 * app skip the new code and keep running the installer's copy.
 */
function loadRuntimeOverlay() {
  const userData = app.getPath('userData');
  const runtimeDir = path.join(userData, 'runtime');
  const runtimeMain = path.join(runtimeDir, 'src', 'main', 'main.js');
  if (path.resolve(runtimeMain) === path.resolve(__filename)) {
    process.env.OFFICELINK_USING_RUNTIME = '1';
    process.env.OFFICELINK_RUNTIME = runtimeDir;
    return false;
  }
  delete process.env.OFFICELINK_USING_RUNTIME;
  delete process.env.OFFICELINK_RUNTIME;
  const marker = path.join(userData, 'use-runtime');
  if (!app.isPackaged && !fs.existsSync(marker)) return false;
  if (!fs.existsSync(runtimeMain)) return false;
  // Someone installed a newer .dmg/.exe after the last update: that wins over
  // the older downloaded code (the marker is rewritten on every update).
  try {
    const built = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'build-info.json'), 'utf8')).builtAt || 0;
    if (built && built > fs.statSync(marker).mtimeMs) return false;
  } catch {
    // not an installer build, or never updated
  }
  process.env.OFFICELINK_USING_RUNTIME = '1';
  process.env.OFFICELINK_RUNTIME = runtimeDir;
  try {
    require(runtimeMain);
    return true;
  } catch (err) {
    // Broken update: fall back to the installer's code so the app still opens.
    console.error('Updated code failed to load, using the installed version', err);
    delete process.env.OFFICELINK_USING_RUNTIME;
    delete process.env.OFFICELINK_RUNTIME;
    return false;
  }
}

if (loadRuntimeOverlay()) return;

const { ChatEngine } = require('./engine');
const { AppUpdater, startUpdateLoop } = require('./updater');

const isMac = process.platform === 'darwin';
let win = null;
let tray = null;
let engine = null;
let updater = null;
let quitting = false;

protocol.registerSchemesAsPrivileged([
  { scheme: 'olfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

async function makeThumbnail(filePath) {
  let img = null;
  try {
    img = await nativeImage.createThumbnailFromPath(filePath, { width: 400, height: 400 });
  } catch {
    img = null;
  }
  if (!img || img.isEmpty()) img = nativeImage.createFromPath(filePath);
  if (!img || img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const scale = Math.min(1, 280 / Math.max(width, height));
  const resized = scale < 1 ? img.resize({ width: Math.round(width * scale), quality: 'good' }) : img;
  const ext = path.extname(filePath).toLowerCase();
  if (['.png', '.gif', '.webp'].includes(ext)) return resized.toDataURL();
  return `data:image/jpeg;base64,${resized.toJPEG(72).toString('base64')}`;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(`evt:${channel}`, payload);
}

function showWindow() {
  if (quitting || !engine) return;
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function updateBadge(state) {
  const total = Object.values(state.convs).reduce((sum, c) => sum + (c.unread || 0), 0);
  if (isMac) app.setBadgeCount(total);
  tray?.setToolTip(total ? `OfficeLink — ${total} unread` : 'OfficeLink');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    title: 'OfficeLink',
    backgroundColor: '#0f1117',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    autoHideMenuBar: !isMac,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('Renderer gone:', details.reason, details.exitCode);
    if (details.reason !== 'clean-exit' && win && !win.isDestroyed()) setTimeout(() => win?.reload(), 500);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  win.on('focus', () => {
    win.flashFrame(false);
    send('focus', true);
  });
  win.on('blur', () => send('focus', false));
  win.on('close', (e) => {
    if (quitting) return;
    if (isMac || engine?.settings.runInBackground) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

function createTray() {
  if (isMac) return;
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('OfficeLink');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open OfficeLink', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', showWindow);
}

function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        { label: 'How OfficeLink works', click: () => send('open-help') },
        { label: 'Update OfficeLink', click: () => updater?.apply() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const ENGINE_METHODS = new Set([
  'getState',
  'getMessages',
  'sendText',
  'sendFiles',
  'sendBuffer',
  'editMessage',
  'deleteMessage',
  'react',
  'typing',
  'markRead',
  'setActive',
  'createGroup',
  'updateGroup',
  'leaveGroup',
  'updateProfile',
  'updateSettings',
  'downloadFile',
  'cancelDownload',
  'addPeerByAddress',
  'findUsers',
  'removePeer',
  'search',
  'togglePin',
  'toggleMute',
  'forwardMessage',
  'testPeer',
  'retryPending',
  'markAllRead',
  'clearConversation',
]);

function registerIpc() {
  ipcMain.handle('engine', async (_e, method, ...args) => {
    if (!ENGINE_METHODS.has(method)) throw new Error(`Unknown method ${method}`);
    return engine[method](...args);
  });

  ipcMain.handle('pick-files', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Share files',
      properties: ['openFile', 'multiSelections'],
    });
    if (res.canceled) return [];
    const fs = require('fs');
    return res.filePaths.map((p) => {
      let size = 0;
      try {
        size = fs.statSync(p).size;
      } catch {
        size = 0;
      }
      return { path: p, name: path.basename(p), size };
    });
  });

  ipcMain.handle('pick-folder', async (_e, current) => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose download folder',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory'],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('open-file', async (_e, fileId) => {
    const p = engine.localPathFor(fileId);
    if (!p) return 'File not found';
    return shell.openPath(p);
  });

  ipcMain.handle('show-in-folder', async (_e, fileId) => {
    const p = engine.localPathFor(fileId);
    if (p) shell.showItemInFolder(p);
  });

  ipcMain.handle('open-folder', async (_e, dir) => {
    const allowed = new Set([engine.settings.downloadDir]);
    if (allowed.has(dir)) return shell.openPath(dir);
    return null;
  });

  ipcMain.handle('open-external', async (_e, url) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
  });

  ipcMain.handle('open-mac-privacy', async () => {
    const urls = [
      'x-apple.systempreferences:com.apple.LocalNetwork-Settings.extension',
      'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_LocalNetwork',
      'x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork',
    ];
    for (const url of urls) {
      try {
        await shell.openExternal(url);
        return true;
      } catch {
        // try next macOS version’s URL
      }
    }
    return false;
  });

  ipcMain.handle('copy-text', async (_e, text) => {
    clipboard.writeText(String(text || ''));
  });

  ipcMain.handle('update', async (_e, action) => {
    if (!updater) throw new Error('Updater is not ready');
    if (action === 'check') return updater.check({ silent: false });
    if (action === 'apply' || action === 'download' || action === 'install') return updater.apply();
    if (action === 'cancel') {
      updater.cancel();
      return updater.state;
    }
    throw new Error('Unknown update action');
  });
}

function wireEngine() {
  engine.on('state', (state) => {
    send('state', state);
    updateBadge(state);
  });
  engine.on('messages', (payload) => send('messages', payload));
  engine.on('removed', (payload) => send('removed', payload));
  engine.on('cleared', (payload) => send('cleared', payload));
  engine.on('typing', (payload) => send('typing', payload));
  engine.on('transfer', (payload) => send('transfer', payload));
  engine.on('log', (line) => console.log('[engine]', line));
  engine.on('notify', ({ convId, title, body, sound }) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, silent: sound === false });
    n.on('click', () => {
      showWindow();
      send('open-conv', convId);
    });
    n.show();
    if (win && !win.isFocused()) win.flashFrame(true);
  });
}

async function boot() {
  app.setAppUserModelId('com.officelink.chat');
  buildMenu();

  const codeRoot = process.env.OFFICELINK_RUNTIME || app.getAppPath();
  let pkgVersion = app.getVersion();
  try {
    pkgVersion = JSON.parse(fs.readFileSync(path.join(codeRoot, 'package.json'), 'utf8')).version || pkgVersion;
  } catch {
    // keep electron version
  }

  engine = new ChatEngine({
    dataDir: path.join(app.getPath('userData'), 'officelink'),
    defaultDownloadDir: path.join(app.getPath('downloads'), 'OfficeLink'),
    makeThumbnail,
    appVersion: pkgVersion,
    codeRoot,
    feedDirs: [],
  });
  wireEngine();
  registerIpc();
  try {
    await engine.start();
  } catch (err) {
    dialog.showErrorBox('OfficeLink could not start networking', err.message);
  }

  updater = new AppUpdater({
    engine,
    send,
    showWindow,
    relaunch: () => {
      // Installers already out there still trust this flag at startup;
      // don't pass it to the new process or it skips the updated code.
      delete process.env.OFFICELINK_USING_RUNTIME;
      delete process.env.OFFICELINK_RUNTIME;
      app.relaunch();
      app.exit(0);
    },
    appVersion: pkgVersion,
    packaged: app.isPackaged,
    codeRoot,
    runtimeDir: path.join(app.getPath('userData'), 'runtime'),
    projectDir: app.isPackaged ? app.getAppPath() : process.cwd(),
  });
  startUpdateLoop(updater);

  protocol.handle('olfile', (req) => {
    const id = new URL(req.url).pathname.replace(/^\//, '');
    const p = engine.localPathFor(id);
    if (!p) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(p).toString());
  });

  createWindow();
  createTray();

  powerMonitor.on('resume', () => {
    engine.discovery?.announce('hello');
    engine.syncKnownPeers?.({ force: true });
    engine.retryPending?.().catch(() => {});
    engine.probeLan?.().catch(() => {});
  });
  probeLocalNetwork();
}

function probeLocalNetwork() {
  engine?.discovery?.announce('hello');
  if (process.platform !== 'darwin') return;
  const dgram = require('dgram');
  const probe = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  probe.on('error', () => {
    try {
      probe.close();
    } catch {
      // ignore
    }
  });
  probe.bind(0, () => {
    try {
      probe.setBroadcast(true);
    } catch {
      // ignore
    }
    probe.send(Buffer.from('{"app":"officelink","type":"probe"}'), 45320, '255.255.255.255', () => {
      try {
        probe.close();
      } catch {
        // ignore
      }
    });
  });
}

if (!profile && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(boot);
  app.on('activate', showWindow);
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
  let stopped = false;
  app.on('will-quit', (e) => {
    if (stopped || !engine) return;
    e.preventDefault();
    stopped = true;
    Promise.race([engine.stop(), new Promise((r) => setTimeout(r, 4500))])
      .catch(() => {})
      .finally(() => app.exit(0));
  });
}
