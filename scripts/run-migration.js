/**
 * Simple wrapper script to run migration with config file
 */

const { spawn } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'migrate-students.js');

console.log('🚀 Starting student migration...');
console.log('📋 Reading credentials from migration-config.json\n');

const child = spawn('node', [scriptPath], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

