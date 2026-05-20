'use strict';
const { ipcMain, BrowserWindow, app } = require('electron');
const state = require('./state');

function registerIpcHandlers() {
ipcMain.handle('toggle-always-on-top', () => {
  if (state.mainWindow) {
    const isAlwaysOnTop = state.mainWindow.isAlwaysOnTop();
    state.mainWindow.setAlwaysOnTop(!isAlwaysOnTop);
    return !isAlwaysOnTop;
  }
  return false;
});

ipcMain.handle('open-student-view', () => {
  const studentWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    frame: true,
    alwaysOnTop: true, // Student view also always on top
    parent: state.mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  studentWindow.loadURL(`http://localhost:${state.PORT}/student.html`);
  
  studentWindow.on('closed', () => {
    studentWindow = null;
  });
});

// Handle window.open requests (for class-view, application-window and other popups)
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    const forceAlwaysOnTop = (win) => {
      try {
        // Use a stronger level so the window stays on top more reliably across apps.
        win.setAlwaysOnTop(true, 'screen-saver');
      } catch {
        try { win.setAlwaysOnTop(true); } catch {}
      }
      // macOS: keep visible across workspaces/fullscreen if supported.
      try { win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true }); } catch {}
    };

    // If opening class-view.html, create a narrow, tall, always-on-top window
    if (url.includes('class-view.html')) {
      const classWindow = new BrowserWindow({
        width: 350,
        height: 800,
        minWidth: 300,
        minHeight: 400,
        frame: false, // Frameless for custom titlebar
        alwaysOnTop: true, // Always on top
        resizable: true,
        skipTaskbar: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      // Ensure alwaysOnTop is set after window creation
      forceAlwaysOnTop(classWindow);

      classWindow.loadURL(url);
      
      // Ensure alwaysOnTop remains true after loading
      classWindow.once('ready-to-show', () => {
        forceAlwaysOnTop(classWindow);
        classWindow.show();
        classWindow.focus(); // Bring window to front
      });
      
      // Ensure alwaysOnTop remains true when window gains focus
      classWindow.on('focus', () => {
        forceAlwaysOnTop(classWindow);
      });

      // Re-assert on blur/show too (some OS/window managers can drop the flag transiently)
      classWindow.on('blur', () => {
        forceAlwaysOnTop(classWindow);
      });
      classWindow.on('show', () => {
        forceAlwaysOnTop(classWindow);
      });
      
      classWindow.on('closed', () => {
        classWindow = null;
      });
      
      return { action: 'deny' }; // We handle the window creation manually
    }
    
    // If opening application-window.html, create a game window
    if (url.includes('application-window.html')) {
      const gameWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: true,
        alwaysOnTop: true, // Always on top
        resizable: true,
        skipTaskbar: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      gameWindow.setAlwaysOnTop(true);
      gameWindow.loadURL(url);
      
      gameWindow.once('ready-to-show', () => {
        gameWindow.setAlwaysOnTop(true);
        gameWindow.show();
        gameWindow.focus();
      });
      
      gameWindow.on('focus', () => {
        gameWindow.setAlwaysOnTop(true);
      });
      
      gameWindow.on('closed', () => {
        gameWindow = null;
      });
      
      return { action: 'deny' }; // We handle the window creation manually
    }
    
    // Allow other windows (like student.html) but with alwaysOnTop
    const newWindow = new BrowserWindow({
      alwaysOnTop: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    newWindow.loadURL(url);
    
    return { action: 'deny' }; // We handle the window creation manually
  });

  // Handle will-navigate to prevent navigation to external URLs
  contents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      if (parsedUrl.origin !== `http://localhost:${state.PORT}` && parsedUrl.origin !== `file://`) {
        event.preventDefault();
      }
    } catch (e) {
      // Invalid URL, prevent navigation
      event.preventDefault();
    }
  });
});
}

module.exports = { registerIpcHandlers };
