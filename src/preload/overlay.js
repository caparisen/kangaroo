'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayBridge', {
  onShow: (callback) => ipcRenderer.on('overlay:show', (_event, payload) => callback(payload)),
  onMove: (callback) => ipcRenderer.on('overlay:move', (_event, payload) => callback(payload)),
  onHide: (callback) => ipcRenderer.on('overlay:hide', () => callback()),
  onConfig: (callback) => ipcRenderer.on('overlay:config', (_event, payload) => callback(payload)),
  finished: () => ipcRenderer.send('overlay:done')
});
