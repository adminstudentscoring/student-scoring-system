/**
 * Sync local users.txt into the runtime data directory.
 * Ensures deployments always pick up the latest user accounts.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, 'data', 'users.txt');
// Use the same logic as server.js to determine target file
const envUsersFile = process.env.USERS_FILE || path.join('data', 'users.txt');
const targetFile = path.isAbsolute(envUsersFile)
  ? envUsersFile
  : path.join(__dirname, envUsersFile);

// Also try to sync to Volume mount point if it exists
// Railway volumes are typically mounted, but we'll use the same path as server.js

console.log(`[sync-users] Source: ${sourceFile}`);
console.log(`[sync-users] Target: ${targetFile}`);

if (!fs.existsSync(sourceFile)) {
  console.warn(`[sync-users] Source file not found: ${sourceFile}. Skipping sync.`);
  process.exit(0);
}

// Read source file to verify content
const sourceContent = fs.readFileSync(sourceFile, 'utf8');
const sourceData = JSON.parse(sourceContent);
console.log(`[sync-users] Source file contains ${sourceData.users.length} users`);
sourceData.users.forEach((user, i) => {
  console.log(`[sync-users]   ${i + 1}. ${user.email} (${user.role})`);
});

const targetDir = path.dirname(targetFile);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`[sync-users] Created target directory: ${targetDir}`);
}

try {
  // Read source content
  const sourceContent = fs.readFileSync(sourceFile, 'utf8');
  const sourceData = JSON.parse(sourceContent);
  
  // Write to target (this ensures we write the correct content even if target exists)
  fs.writeFileSync(targetFile, sourceContent, 'utf8');
  console.log(`[sync-users] ✅ Users file synced to ${targetFile}`);
  
  // Verify the copied file
  const targetContent = fs.readFileSync(targetFile, 'utf8');
  const targetData = JSON.parse(targetContent);
  console.log(`[sync-users] ✅ Verified: Target file contains ${targetData.users.length} users`);
  
  // Check for admin user
  const hasAdmin = targetData.users.some(u => u.email === 'admin@studentscoring.com' && u.role === 'admin');
  if (hasAdmin) {
    console.log(`[sync-users] ✅ Admin user confirmed in target file`);
  } else {
    console.log(`[sync-users] ⚠️  WARNING: Admin user NOT found in target file!`);
  }
} catch (error) {
  console.error('[sync-users] ❌ Failed to sync users file:', error);
  process.exit(1);
}

