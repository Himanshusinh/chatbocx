const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  call: (method, ...args) => ipcRenderer.invoke('engine', method, ...args),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickFolder: (current) => ipcRenderer.invoke('pick-folder', current),
  openFile: (fileId) => ipcRenderer.invoke('open-file', fileId),
  showInFolder: (fileId) => ipcRenderer.invoke('show-in-folder', fileId),
  openFolder: (dir) => ipcRenderer.invoke('open-folder', dir),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  update: (action) => ipcRenderer.invoke('update', action),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  on: (channel, cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(`evt:${channel}`, listener);
    return () => ipcRenderer.removeListener(`evt:${channel}`, listener);
  },
});
