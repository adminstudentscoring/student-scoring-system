/**
 * Sync users.txt into the runtime data directory.
 * Clears all existing users and creates only the admin user.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');

// Use the same logic as server.js to determine target file
const envUsersFile = process.env.USERS_FILE || path.join('data', 'users.txt');
const targetFile = path.isAbsolute(envUsersFile)
  ? envUsersFile
  : path.join(__dirname, envUsersFile);

async function syncUsers() {
  try {
    console.log(`[sync-users] Target: ${targetFile}`);
    console.log(`[sync-users] Clearing all existing users and creating fresh admin user...`);
    
    // Hash admin password
    const adminPasswordHash = await hashPassword('C25da1212');
    
    // Create fresh users data with only admin
    const usersData = {
      users: [
        {
          id: Date.now().toString(),
          email: "admin@studentscoring.com",
          password: adminPasswordHash,
          name: "System Administrator",
          role: "admin",
          createdAt: new Date().toISOString()
        }
      ],
      lastUpdate: new Date().toISOString()
    };

    console.log(`[sync-users] Creating admin user: admin@studentscoring.com`);
    console.log(`[sync-users] Password: C25da1212`);

    const targetDir = path.dirname(targetFile);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`[sync-users] Created target directory: ${targetDir}`);
    }

    // Write fresh data to target file (overwrites all existing users)
    fs.writeFileSync(targetFile, JSON.stringify(usersData, null, 2), 'utf8');
    console.log(`[sync-users] ✅ Users file written to ${targetFile}`);
    
    // Verify the written file
    const targetContent = fs.readFileSync(targetFile, 'utf8');
    const targetData = JSON.parse(targetContent);
    console.log(`[sync-users] ✅ Verified: Target file contains ${targetData.users.length} user(s)`);
    
    // Check for admin user
    const adminUser = targetData.users.find(u => u.email === 'admin@studentscoring.com' && u.role === 'admin');
    if (adminUser) {
      console.log(`[sync-users] ✅ Admin user confirmed in target file`);
      console.log(`[sync-users]   Admin password hash: ${adminUser.password.substring(0, 30)}...`);
    } else {
      console.log(`[sync-users] ⚠️  WARNING: Admin user NOT found in target file!`);
    }
  } catch (error) {
    console.error('[sync-users] ❌ Failed to write users file:', error);
    process.exit(1);
  }
}

// Run the sync
syncUsers();
