'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kangaroo', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (patch) => ipcRenderer.invoke('config:update', patch),
  resetConfig: () => ipcRenderer.invoke('config:reset'),
  onSpeedSample: (callback) => ipcRenderer.on('speed:sample', (_event, sample) => callback(sample)),
  onConfigChanged: (callback) => ipcRenderer.on('config:changed', (_event, config) => callback(config))
});
