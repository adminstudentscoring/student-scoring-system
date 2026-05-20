'use strict';

let mainWindow = null;
let serverProcess = null;
const PORT = 7001;

module.exports = {
  PORT,
  get mainWindow() { return mainWindow; },
  set mainWindow(w) { mainWindow = w; },
  get serverProcess() { return serverProcess; },
  set serverProcess(p) { serverProcess = p; }
};
