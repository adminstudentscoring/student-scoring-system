/**
 * Sync users.txt into the runtime data directory.
 * Merges existing users with required users (preserves Volume users, adds/updates admin).
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');

// Required users that must exist (from Git repository)
// Note: Admin password will be hashed dynamically
async function getRequiredUsers() {
  // Hash admin password
  const adminPasswordHash = await hashPassword('C25da1212');
  
  return [
    {
      id: "1763980617325",
      email: "testing@studentscoring.com",
      password: "$2b$10$Gxv.XfyPTfWQHTBzfJdC3.5GoiKPutxMSgS.nSYYT50ektRXqqjDq",
      name: "Testing",
      role: "organization",
      organizationId: "1763980617324",
      createdAt: "2025-11-24T10:36:57.325Z"
    },
    {
      id: "1763980672227",
      email: "testingwpt",
      username: "TestingWPT",
      password: "$2b$10$SRmXMyzjgokGrJKoGWO6x.o7wdLQUXJs1qbtTzc7VHgUsfBokjVNu",
      name: "Wong Pui Tak",
      teacherId: "TestingWPT",
      gender: "male",
      role: "teacher",
      organizationId: "1763980617324",
      createdAt: "2025-11-24T10:37:52.227Z",
      classViewStudents: ["1763980770553"],
      assignedStudents: ["1763980770553"]
    },
    {
      id: "1764132563553",
      email: "admin@studentscoring.com",
      password: adminPasswordHash, // Dynamically hashed
      name: "System Administrator",
      role: "admin",
      createdAt: "2025-11-26T04:49:23.553Z"
    }
  ];
}

// Use the same logic as server.js to determine target file
const envUsersFile = process.env.USERS_FILE || path.join('data', 'users.txt');
const targetFile = path.isAbsolute(envUsersFile)
  ? envUsersFile
  : path.join(__dirname, envUsersFile);

async function syncUsers() {
  try {
    // Get required users (must exist)
    const requiredUsers = await getRequiredUsers();
    
    console.log(`[sync-users] Target: ${targetFile}`);
    
    // Read existing users from Volume (if file exists)
    let existingUsers = [];
    if (fs.existsSync(targetFile)) {
      try {
        const existingContent = fs.readFileSync(targetFile, 'utf8');
        const existingData = JSON.parse(existingContent);
        existingUsers = existingData.users || [];
        console.log(`[sync-users] Found ${existingUsers.length} existing users in Volume`);
      } catch (error) {
        console.warn(`[sync-users] Could not read existing file, starting fresh: ${error.message}`);
      }
    }

    // Merge users: keep existing users, update/add required users
    const mergedUsers = [...existingUsers];
    
    requiredUsers.forEach(requiredUser => {
      const existingIndex = mergedUsers.findIndex(u => 
        u.email === requiredUser.email || 
        (requiredUser.username && u.username === requiredUser.username)
      );
      
      if (existingIndex >= 0) {
        // Update existing user
        console.log(`[sync-users] Updating user: ${requiredUser.email || requiredUser.username}`);
        mergedUsers[existingIndex] = requiredUser;
      } else {
        // Add new user
        console.log(`[sync-users] Adding new user: ${requiredUser.email || requiredUser.username}`);
        mergedUsers.push(requiredUser);
      }
    });

    const mergedData = {
      users: mergedUsers,
      lastUpdate: new Date().toISOString()
    };

    console.log(`[sync-users] Merged result: ${mergedUsers.length} total users`);
    mergedUsers.forEach((user, i) => {
      console.log(`[sync-users]   ${i + 1}. ${user.email || user.username} (${user.role})`);
    });

    const targetDir = path.dirname(targetFile);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`[sync-users] Created target directory: ${targetDir}`);
    }

    // Write merged data to target file
    fs.writeFileSync(targetFile, JSON.stringify(mergedData, null, 2), 'utf8');
    console.log(`[sync-users] ✅ Users file written to ${targetFile}`);
    
    // Verify the written file
    const targetContent = fs.readFileSync(targetFile, 'utf8');
    const targetData = JSON.parse(targetContent);
    console.log(`[sync-users] ✅ Verified: Target file contains ${targetData.users.length} users`);
    
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
