'use strict';
const { BrowserWindow } = require('electron');
const state = require('./state');

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
    
    state.mainWindow = new BrowserWindow({
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
    state.mainWindow.webContents.openDevTools();
    console.log('[DEBUG] DevTools opened');

    // Load the teacher dashboard
    const url = `http://localhost:${state.PORT}`;
    console.log(`[DEBUG] Attempting to load URL: ${url}`);
    
    // Log all webContents events for debugging
    state.mainWindow.webContents.on('did-start-loading', () => {
      console.log('[DEBUG] ✅ did-start-loading: Page started loading');
    });

    state.mainWindow.webContents.on('did-stop-loading', () => {
      console.log('[DEBUG] ✅ did-stop-loading: Page stopped loading');
    });

    state.mainWindow.webContents.on('did-frame-finish-load', (event, isMainFrame) => {
      console.log(`[DEBUG] ✅ did-frame-finish-load: Frame finished loading (isMainFrame: ${isMainFrame})`);
    });

    state.mainWindow.webContents.on('dom-ready', () => {
      console.log('[DEBUG] ✅ dom-ready: DOM is ready');
    });

    state.mainWindow.webContents.on('did-finish-load', () => {
      console.log('[DEBUG] ✅ did-finish-load: Page loaded successfully');
      console.log('[DEBUG] Current URL:', state.mainWindow.webContents.getURL());
      state.mainWindow.show(); // Show window after content loads
    });

    state.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error(`[DEBUG] ❌ did-fail-load:`);
      console.error(`  Error Code: ${errorCode}`);
      console.error(`  Error Description: ${errorDescription}`);
      console.error(`  Validated URL: ${validatedURL}`);
      console.error(`  Is Main Frame: ${isMainFrame}`);
      
      // Show window even on error so user can see DevTools
      if (!state.mainWindow.isVisible()) {
        state.mainWindow.show();
      }
      
      // Retry loading after a short delay
      if (errorCode !== -3) { // -3 is ERR_ABORTED, don't retry those
        console.log('[DEBUG] Will retry loading in 2 seconds...');
        setTimeout(() => {
          console.log('[DEBUG] Retrying to load URL...');
          state.mainWindow.loadURL(url).catch((retryError) => {
            console.error('[DEBUG] ❌ Retry also failed:', retryError);
            showErrorPage(state.mainWindow, retryError);
          });
        }, 2000);
      }
    });

    state.mainWindow.webContents.on('did-fail-provisional-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error(`[DEBUG] ❌ did-fail-provisional-load:`);
      console.error(`  Error Code: ${errorCode}`);
      console.error(`  Error Description: ${errorDescription}`);
      console.error(`  Validated URL: ${validatedURL}`);
      console.error(`  Is Main Frame: ${isMainFrame}`);
    });

    // Listen for console messages from renderer
    state.mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const levelStr = ['log', 'warning', 'error', 'info', 'debug'][level] || 'log';
      console.log(`[Renderer ${levelStr}] ${message} (line ${line})`);
    });

    // Listen for uncaught exceptions in renderer
    state.mainWindow.webContents.on('unresponsive', () => {
      console.error('[DEBUG] ❌ WebContents became unresponsive');
    });

    state.mainWindow.webContents.on('responsive', () => {
      console.log('[DEBUG] ✅ WebContents became responsive again');
    });

    state.mainWindow.webContents.on('crashed', (event, killed) => {
      console.error(`[DEBUG] ❌ WebContents crashed (killed: ${killed})`);
    });

    // Try to load the page
    state.mainWindow.loadURL(url).catch((error) => {
      console.error('[DEBUG] ❌ loadURL promise rejected:');
      console.error('  Error:', error);
      console.error('  Error type:', error.constructor.name);
      console.error('  Error message:', error.message);
      console.error('  Error stack:', error.stack);
      
      // Show window so user can see error in DevTools
      if (!state.mainWindow.isVisible()) {
        state.mainWindow.show();
      }
      
      // Retry after delay
      setTimeout(() => {
        console.log('[DEBUG] Retrying to load URL...');
        state.mainWindow.loadURL(url).catch((retryError) => {
          console.error('[DEBUG] ❌ Retry also failed:', retryError);
          showErrorPage(state.mainWindow, retryError);
        });
      }, 2000);
    });

    state.mainWindow.on('closed', () => {
      console.log('[DEBUG] Window closed');
      state.mainWindow = null;
    });

    state.mainWindow.on('close', (event) => {
      console.log('[DEBUG] Window close event triggered');
      // Optionally minimize to tray instead of closing
      // event.preventDefault();
      // state.mainWindow.hide();
    });

    state.mainWindow.on('ready-to-show', () => {
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
    <p>Could not connect to server at <code>http://localhost:${state.PORT}</code></p>
    <p><strong>Error:</strong> ${safeErrorMessage}</p>
    <p>The server might still be starting. Please wait a moment and the page should auto-refresh.</p>
    <p><small>If this persists, please check the terminal for server errors.</small></p>
  </div>
  <script>
    console.log('Error page loaded. Will retry in 3 seconds...');
    setTimeout(function() { 
      console.log('Retrying...');
      window.location.href = 'http://localhost:${state.PORT}'; 
    }, 3000);
  </script>
</body>
</html>`;
      console.log('[DEBUG] Showing error page');
      window.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    }
  };
 }

module.exports = { createWindow };
