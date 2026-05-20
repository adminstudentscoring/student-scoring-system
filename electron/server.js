'use strict';
const { spawn, exec } = require('child_process');
const { dialog } = require('electron');
const net = require('net');
const path = require('path');
const state = require('./state');

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
  
  const portInUse = await isPortInUse(state.PORT);
  
  if (portInUse) {
    console.log(`Port ${state.PORT} is in use. Attempting to free it...`);
    
    const killed = await killProcessOnPort(state.PORT);
    
    if (killed) {
      console.log('Port freed successfully. Waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.warn(`⚠️  Warning: Could not free port ${state.PORT}. The server might fail to start.`);
      console.warn('Please close any other instances of this application or processes using port 7001.');
      
      // Show dialog to user (after window is created)
      // We'll show this after the window is ready
      setTimeout(() => {
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          dialog.showMessageBox(state.mainWindow, {
            type: 'warning',
            title: 'Port Already in Use',
            message: `Port ${state.PORT} is already in use.`,
            detail: 'The application will try to start anyway, but may fail. Please close any other instances using port 7001.',
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
  state.serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true
  });

  state.serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
    if (state.mainWindow) {
      dialog.showErrorBox('Server Error', `Failed to start server: ${error.message}`);
    }
  });

  state.serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
    if (code !== 0 && code !== null) {
      console.error('Server exited with error code:', code);
    }
  });
}

// Stop the server when app closes
function stopServer() {
  if (state.serverProcess) {
    state.serverProcess.kill();
    state.serverProcess = null;
  }
}

module.exports = { startServer, stopServer };
