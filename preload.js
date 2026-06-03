const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('muse', {
  sendPlayerState: (s) => ipcRenderer.send('player-state', s),
  // Structured clone, not JSON — at 30fps the stringify cost shows up.
  sendSpectrum: (frame) => ipcRenderer.send('spectrum-frame', frame),
  loadCookie: () => ipcRenderer.invoke('cookie-load'),
  saveCookie: (c) => ipcRenderer.invoke('cookie-save', c),
  clearCookie: () => ipcRenderer.invoke('cookie-clear'),
  onOpenCommandSurface: (cb) => ipcRenderer.on('open-command-surface', () => cb()),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  resizeWindow: (w, h) => ipcRenderer.invoke('resize-window', w, h),
  onWindowAppear: (cb) => ipcRenderer.on('window-appear', () => cb()),
  store: {
    get: (key, fallback) => ipcRenderer.invoke('store-get', key, fallback),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
  },
  history: {
    add: (event) => ipcRenderer.invoke('history-add', event),
  },
  ncmBase: 'http://127.0.0.1:10754',
});
