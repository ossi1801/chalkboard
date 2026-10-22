const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('chalkboardDesktop', {
  isElectron: true,
  platform: process.platform,
});
