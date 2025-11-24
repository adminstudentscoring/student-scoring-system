const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const net = require('net');

let mainWindow = null;
let serverProcess = null;
const PORT = 3000;

// Check if port is in use
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(false));
      server.close();
    });
    server.on('error', () => resolve(true));
  });
}

// Kill process using the port (Windows)
function killProcessOnPort(port) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      // Windows: Find and kill process using the port
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (error || !stdout) {
          resolve(false);
          return;
        }
        
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length > 0) {
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(pid)) {
              pids.add(pid);
            }
          }
        });
        
        if (pids.size === 0) {
          resolve(false);
          return;
        }
        
        // Kill all processes using the port
        let killed = 0;
        const total = pids.size;
        
        pids.forEach(pid => {
          exec(`taskkill /F /PID ${pid}`, (killError) => {
            if (!killError) {
              console.log(`Killed process ${pid} using port ${port}`);
              killed++;
            }
            if (killed === total) {
              // Wait a bit for port to be released
              setTimeout(() => resolve(killed > 0), 1000);
            }
          });
        });
      });
    } else {
      // Unix-like systems
      exec(`lsof -ti:${port} | xargs kill -9`, (error) => {
        if (!error) {
          setTimeout(() => resolve(true), 1000);
        } else {
          resolve(false);
        }
      });
    }
  });
}

// Start the Express server
async function startServer() {
  console.log('Checking if port is available...');
  
  const portInUse = await isPortInUse(PORT);
  
  if (portInUse) {
    console.log(`Port ${PORT} is in use. Attempting to free it...`);
    
    const killed = await killProcessOnPort(PORT);
    
    if (killed) {
      console.log('Port freed successfully. Waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.warn(`⚠️  Warning: Could not free port ${PORT}. The server might fail to start.`);
      console.warn('Please close any other instances of this application or processes using port 3000.');
      
      // Show dialog to user (after window is created)
      // We'll show this after the window is ready
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Port Already in Use',
            message: `Port ${PORT} is already in use.`,
            detail: 'The application will try to start anyway, but may fail. Please close any other instances using port 3000.',
            buttons: ['OK']
          });
        }
      }, 5000);
    }
  }
  
  startServerInternal();
}

function startServerInternal() {
  console.log('Starting server...');
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
  });

  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
    if (mainWindow) {
      dialog.showErrorBox('Server Error', `Failed to start server: ${error.message}`);
    }
  });

  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
    if (code !== 0 && code !== null) {
      console.error('Server exited with error code:', code);
    }
  });
}

// Stop the server when app closes
function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

// Create the floating window
function createWindow() {
  console.log('Waiting for server to be ready...');
  
  // Simple approach: Wait 3 seconds for server to fully start, then create window
  // The server should be ready by then
  setTimeout(() => {
    console.log('Creating Electron window...');
    createWindowInternal();
  }, 3000);

    const createWindowInternal = () => {
    console.log('[DEBUG] Creating BrowserWindow...');
    
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      frame: true,
      alwaysOnTop: true, // Always on top
      skipTaskbar: false,
      show: false, // Don't show until ready
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: true,
        devTools: true,
        sandbox: false // Required for some features, but we use contextIsolation for security
      }
      // icon: path.join(__dirname, 'assets', 'icon.png') // Optional: add icon later
    });

    console.log('[DEBUG] BrowserWindow created successfully');
    
    // Open DevTools immediately for debugging
    console.log('[DEBUG] Opening DevTools...');
    mainWindow.webContents.openDevTools();
    console.log('[DEBUG] DevTools opened');

    // Load the teacher dashboard
    const url = `http://localhost:${PORT}`;
    console.log(`[DEBUG] Attempting to load URL: ${url}`);
    
    // Log all webContents events for debugging
    mainWindow.webContents.on('did-start-loading', () => {
      console.log('[DEBUG] ✅ did-start-loading: Page started loading');
    });

    mainWindow.webContents.on('did-stop-loading', () => {
      console.log('[DEBUG] ✅ did-stop-loading: Page stopped loading');
    });

    mainWindow.webContents.on('did-frame-finish-load', (event, isMainFrame) => {
      console.log(`[DEBUG] ✅ did-frame-finish-load: Frame finished loading (isMainFrame: ${isMainFrame})`);
    });

    mainWindow.webContents.on('dom-ready', () => {
      console.log('[DEBUG] ✅ dom-ready: DOM is ready');
    });

    mainWindow.webContents.on('did-finish-load', () => {
      console.log('[DEBUG] ✅ did-finish-load: Page loaded successfully');
      console.log('[DEBUG] Current URL:', mainWindow.webContents.getURL());
      mainWindow.show(); // Show window after content loads
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error(`[DEBUG] ❌ did-fail-load:`);
      console.error(`  Error Code: ${errorCode}`);
      console.error(`  Error Description: ${errorDescription}`);
      console.error(`  Validated URL: ${validatedURL}`);
      console.error(`  Is Main Frame: ${isMainFrame}`);
      
      // Show window even on error so user can see DevTools
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      
      // Retry loading after a short delay
      if (errorCode !== -3) { // -3 is ERR_ABORTED, don't retry those
        console.log('[DEBUG] Will retry loading in 2 seconds...');
        setTimeout(() => {
          console.log('[DEBUG] Retrying to load URL...');
          mainWindow.loadURL(url).catch((retryError) => {
            console.error('[DEBUG] ❌ Retry also failed:', retryError);
            showErrorPage(mainWindow, retryError);
          });
        }, 2000);
      }
    });

    mainWindow.webContents.on('did-fail-provisional-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error(`[DEBUG] ❌ did-fail-provisional-load:`);
      console.error(`  Error Code: ${errorCode}`);
      console.error(`  Error Description: ${errorDescription}`);
      console.error(`  Validated URL: ${validatedURL}`);
      console.error(`  Is Main Frame: ${isMainFrame}`);
    });

    // Listen for console messages from renderer
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const levelStr = ['log', 'warning', 'error', 'info', 'debug'][level] || 'log';
      console.log(`[Renderer ${levelStr}] ${message} (line ${line})`);
    });

    // Listen for uncaught exceptions in renderer
    mainWindow.webContents.on('unresponsive', () => {
      console.error('[DEBUG] ❌ WebContents became unresponsive');
    });

    mainWindow.webContents.on('responsive', () => {
      console.log('[DEBUG] ✅ WebContents became responsive again');
    });

    mainWindow.webContents.on('crashed', (event, killed) => {
      console.error(`[DEBUG] ❌ WebContents crashed (killed: ${killed})`);
    });

    // Try to load the page
    mainWindow.loadURL(url).catch((error) => {
      console.error('[DEBUG] ❌ loadURL promise rejected:');
      console.error('  Error:', error);
      console.error('  Error type:', error.constructor.name);
      console.error('  Error message:', error.message);
      console.error('  Error stack:', error.stack);
      
      // Show window so user can see error in DevTools
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      
      // Retry after delay
      setTimeout(() => {
        console.log('[DEBUG] Retrying to load URL...');
        mainWindow.loadURL(url).catch((retryError) => {
          console.error('[DEBUG] ❌ Retry also failed:', retryError);
          showErrorPage(mainWindow, retryError);
        });
      }, 2000);
    });

    mainWindow.on('closed', () => {
      console.log('[DEBUG] Window closed');
      mainWindow = null;
    });

    mainWindow.on('close', (event) => {
      console.log('[DEBUG] Window close event triggered');
      // Optionally minimize to tray instead of closing
      // event.preventDefault();
      // mainWindow.hide();
    });

    mainWindow.on('ready-to-show', () => {
      console.log('[DEBUG] ✅ Window ready-to-show');
    });

    // Helper function to show error page
    function showErrorPage(window, error) {
      const errorMessage = (error && error.message) ? error.message : String(error);
      const safeErrorMessage = errorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Connection Error</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f5f5f5; }
    .error-box { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto; }
    h1 { color: #e74c3c; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="error-box">
    <h1>⚠️ Failed to Connect</h1>
    <p>Could not connect to server at <code>http://localhost:${PORT}</code></p>
    <p><strong>Error:</strong> ${safeErrorMessage}</p>
    <p>The server might still be starting. Please wait a moment and the page should auto-refresh.</p>
    <p><small>If this persists, please check the terminal for server errors.</small></p>
  </div>
  <script>
    console.log('Error page loaded. Will retry in 3 seconds...');
    setTimeout(function() { 
      console.log('Retrying...');
      window.location.href = 'http://localhost:${PORT}'; 
    }, 3000);
  </script>
</body>
</html>`;
      console.log('[DEBUG] Showing error page');
      window.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    }
  };
 }

// App lifecycle
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

// IPC handlers for window controls
ipcMain.handle('toggle-always-on-top', () => {
  if (mainWindow) {
    const isAlwaysOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isAlwaysOnTop);
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
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  studentWindow.loadURL(`http://localhost:${PORT}/student.html`);
  
  studentWindow.on('closed', () => {
    studentWindow = null;
  });
});

// Handle window.open requests (for class-view, game-window and other popups)
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
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
      classWindow.setAlwaysOnTop(true);

      classWindow.loadURL(url);
      
      // Ensure alwaysOnTop remains true after loading
      classWindow.once('ready-to-show', () => {
        classWindow.setAlwaysOnTop(true);
        classWindow.show();
        classWindow.focus(); // Bring window to front
      });
      
      // Ensure alwaysOnTop remains true when window gains focus
      classWindow.on('focus', () => {
        classWindow.setAlwaysOnTop(true);
      });
      
      classWindow.on('closed', () => {
        classWindow = null;
      });
      
      return { action: 'deny' }; // We handle the window creation manually
    }
    
    // If opening game-window.html, create a game window
    if (url.includes('game-window.html')) {
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
      if (parsedUrl.origin !== `http://localhost:${PORT}` && parsedUrl.origin !== `file://`) {
        event.preventDefault();
      }
    } catch (e) {
      // Invalid URL, prevent navigation
      event.preventDefault();
    }
  });
});
