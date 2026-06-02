const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getHosts: () => ipcRenderer.invoke('get-hosts'),
  getHostTelemetry: (hostname) => ipcRenderer.invoke('get-host-telemetry', hostname),
  getAlerts: (limit) => ipcRenderer.invoke('get-alerts', limit),
  getCentralConfig: () => ipcRenderer.invoke('get-central-config'),
  saveCentralConfig: (config) => ipcRenderer.invoke('save-central-config', config),
  
  // Remote task methods proxied to central server
  listRemoteTasks: (hostname) => ipcRenderer.invoke('list-remote-tasks', hostname),
  runRemoteTask: (hostname, taskName, params) => ipcRenderer.invoke('run-remote-task', { hostname, taskName, params }),
  importRemoteTask: (hostname, payload) => ipcRenderer.invoke('import-remote-task', { hostname, payload }),
  exportRemoteTask: (hostname, taskName) => ipcRenderer.invoke('export-remote-task', { hostname, taskName }),
  removeRemoteTask: (hostname, taskName) => ipcRenderer.invoke('remove-remote-task', { hostname, taskName })
});
