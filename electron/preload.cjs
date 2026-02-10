const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (content, defaultFilename) => ipcRenderer.invoke('save-file', content, defaultFilename)
});
