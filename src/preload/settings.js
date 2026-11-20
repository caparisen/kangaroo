'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kangaroo', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (patch) => ipcRenderer.invoke('config:update', patch),
  resetConfig: () => ipcRenderer.invoke('config:reset'),
  runGesture: (options) => ipcRenderer.invoke('gesture:run', options),
  onGestureSample: (callback) => ipcRenderer.on('gesture:sample', (_event, sample) => callback(sample)),
  onConfigChanged: (callback) => ipcRenderer.on('config:changed', (_event, config) => callback(config))
});
