const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Chalkboard',
    backgroundColor: '#181c20',
    icon: path.join(__dirname, '..', 'assets', 'icon.svg'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the static index.html directly (no bundler or Node dev server required)
  win.loadFile(path.join(__dirname, '..', 'index.html'));

  // Open external links in the default system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// Minimal application menu supporting fullscreen and zoom
const menuTemplate = [
  {
    label: 'File',
    submenu: [{ role: 'quit' }],
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { role: 'toggleDevTools' },
    ],
  },
];

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
