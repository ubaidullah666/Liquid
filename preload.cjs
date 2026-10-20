const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  action: action => ipcRenderer.send('window-action', action),
  personal: (command,payload) => ipcRenderer.invoke('personal-command',command,payload),
  browser: (command, payload) => ipcRenderer.invoke('browser-command', command, payload),
  chat: (command, payload) => ipcRenderer.invoke('chat-command', command, payload),
  onChat: callback => ipcRenderer.on('chat-event', (_event, data) => callback(data)),
  onBrowserState: callback => ipcRenderer.on('browser-state', (_event, state) => callback(state)),
  onBrowserFocus: callback => ipcRenderer.on('browser-focus', (_event, target) => callback(target)),
  onBrowserFind: callback => ipcRenderer.on('browser-find', (_event, result) => callback(result))
});
