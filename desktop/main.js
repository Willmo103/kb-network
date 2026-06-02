const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;
let tray = null;

const dbPath = path.join(os.homedir(), '.kb', 'kb.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
  }
});

// Load config helper
function loadConfig() {
  const configPath = path.join(os.homedir(), '.kb', 'configs', 'kb-network.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.error('Failed to parse config file:', e);
    }
  }
  return { host: '0.0.0.0', port: 8082 };
}

function getCentralServerUrl() {
  const cfg = loadConfig();
  const host = cfg.host === '0.0.0.0' ? 'localhost' : cfg.host;
  return `http://${host}:${cfg.port || 8082}`;
}

// HTTP request helper to call the central FastAPI server
function makeHttpRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const cfg = loadConfig();
    const host = cfg.host === '0.0.0.0' ? 'localhost' : cfg.host;
    const port = cfg.port || 8082;
    
    const postData = body ? JSON.stringify(body) : '';
    const options = {
      hostname: host,
      port: port,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(parsed);
          } else {
            resolve(parsed);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP Error ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (body) {
      req.write(postData);
    }
    req.end();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#F4EFEA',
    title: 'kb-network',
    show: false
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist-frontend', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on('blur', () => {
    if (!isDev && mainWindow.isVisible()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function toggleWindow() {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function setupTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  const trayIcon = fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'package.json');
  
  tray = new Tray(trayIcon);
  tray.setToolTip('kb-network');
  
  tray.on('click', () => {
    toggleWindow();
  });
  
  updateTrayMenu();
  setInterval(updateTrayMenu, 10000); // sync menu with DB changes
}

function updateTrayMenu() {
  if (!tray) return;

  // Check if network_hosts table exists first
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='network_hosts'", (err, tables) => {
    if (err || !tables || tables.length === 0) {
      const template = [
        { label: 'Show Dashboard', click: showWindow },
        { type: 'separator' },
        { label: 'No agents registered', enabled: false },
        { type: 'separator' },
        { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
      ];
      tray.setContextMenu(Menu.buildFromTemplate(template));
      return;
    }

    db.all("SELECT hostname, ip_address, status FROM network_hosts LIMIT 5", [], (err, rows) => {
      const template = [
        { label: 'Show Dashboard', click: showWindow },
        { type: 'separator' }
      ];

      if (rows && rows.length > 0) {
        rows.forEach((row) => {
          let emoji = '🔴';
          if (row.status === 'active') emoji = '🟢';
          else if (row.status === 'stalled') emoji = '🟡';
          
          template.push({
            label: `${emoji} ${row.hostname} (${row.ip_address})`,
            click: showWindow
          });
        });
      } else {
        template.push({ label: 'No agents configured', enabled: false });
      }

      template.push({ type: 'separator' });
      template.push({ label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } });

      tray.setContextMenu(Menu.buildFromTemplate(template));
    });
  });
}

// IPC Handlers
ipcMain.handle('get-hosts', async () => {
  return new Promise((resolve) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='network_hosts'", (err, rows) => {
      if (err || !rows || rows.length === 0) {
        resolve([]);
        return;
      }
      db.all("SELECT * FROM network_hosts ORDER BY hostname ASC", [], (err, hosts) => {
        if (err) resolve([]);
        else resolve(hosts);
      });
    });
  });
});

ipcMain.handle('get-host-telemetry', async (event, hostname) => {
  const result = { host: null, services: [], history: [] };
  
  const getHost = () => new Promise((resolve) => {
    db.get("SELECT * FROM network_hosts WHERE hostname = ?", [hostname], (err, row) => {
      resolve(row || null);
    });
  });

  const getServices = () => new Promise((resolve) => {
    db.all("SELECT * FROM network_services WHERE hostname = ?", [hostname], (err, rows) => {
      resolve(rows || []);
    });
  });

  const getHistory = () => new Promise((resolve) => {
    db.all("SELECT * FROM network_telemetry_history WHERE hostname = ? ORDER BY timestamp DESC LIMIT 30", [hostname], (err, rows) => {
      resolve(rows || []);
    });
  });

  result.host = await getHost();
  if (result.host) {
    result.services = await getServices();
    result.history = await getHistory();
  }
  return result;
});

ipcMain.handle('get-alerts', async (event, limit = 50) => {
  return new Promise((resolve) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='network_alerts'", (err, rows) => {
      if (err || !rows || rows.length === 0) {
        resolve([]);
        return;
      }
      db.all("SELECT * FROM network_alerts ORDER BY timestamp DESC LIMIT ?", [limit], (err, alerts) => {
        if (err) resolve([]);
        else resolve(alerts);
      });
    });
  });
});

ipcMain.handle('get-central-config', () => {
  return loadConfig();
});

ipcMain.handle('save-central-config', (event, config) => {
  const configPath = path.join(os.homedir(), '.kb', 'configs', 'kb-network.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
});

// Remote proxies
ipcMain.handle('list-remote-tasks', async (event, hostname) => {
  return makeHttpRequest('GET', `/hosts/${hostname}/tasks`);
});

ipcMain.handle('run-remote-task', async (event, { hostname, taskName, params }) => {
  return makeHttpRequest('POST', `/hosts/${hostname}/tasks/run/${taskName}`, params);
});

ipcMain.handle('import-remote-task', async (event, { hostname, payload }) => {
  return makeHttpRequest('POST', `/hosts/${hostname}/tasks/import`, payload);
});

ipcMain.handle('export-remote-task', async (event, { hostname, taskName }) => {
  return makeHttpRequest('GET', `/hosts/${hostname}/tasks/export/${taskName}`);
});

ipcMain.handle('remove-remote-task', async (event, { hostname, taskName }) => {
  return makeHttpRequest('DELETE', `/hosts/${hostname}/tasks/remove/${taskName}`);
});

// App initialization
app.whenReady().then(() => {
  createWindow();
  setupTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db.close();
    app.quit();
  }
});
