/**
 * Sync local users.txt into the runtime data directory.
 * Ensures deployments always pick up the latest user accounts.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, 'data', 'users.txt');
const envUsersFile = process.env.USERS_FILE || path.join('data', 'users.txt');
const targetFile = path.isAbsolute(envUsersFile)
  ? envUsersFile
  : path.join(__dirname, envUsersFile);

if (!fs.existsSync(sourceFile)) {
  console.warn(`[sync-users] Source file not found: ${sourceFile}. Skipping sync.`);
  process.exit(0);
}

const targetDir = path.dirname(targetFile);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

try {
  fs.copyFileSync(sourceFile, targetFile);
  console.log(`[sync-users] Users file synced to ${targetFile}`);
} catch (error) {
  console.error('[sync-users] Failed to sync users file:', error);
  process.exit(1);
}

