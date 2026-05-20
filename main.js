'use strict';
const { app, BrowserWindow } = require('electron');
const { startServer, stopServer } = require('./electron/server');
const { createWindow } = require('./electron/window');
const { registerIpcHandlers } = require('./electron/ipc');

registerIpcHandlers();

app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
});
