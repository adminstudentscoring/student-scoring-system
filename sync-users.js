/**
 * Sync users.txt into the runtime data directory.
 * Writes the correct user data directly to ensure Volume has the latest users.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Correct users data (from Git repository)
const correctUsersData = {
  users: [
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
      password: "$2b$10$VU6I.ARfZiq01YzFrFSau.Z0amDxV81KuwUpHPRM1.FAYW9D0NB12",
      name: "System Administrator",
      role: "admin",
      createdAt: "2025-11-26T04:49:23.553Z"
    }
  ],
  lastUpdate: new Date().toISOString()
};

// Use the same logic as server.js to determine target file
const envUsersFile = process.env.USERS_FILE || path.join('data', 'users.txt');
const targetFile = path.isAbsolute(envUsersFile)
  ? envUsersFile
  : path.join(__dirname, envUsersFile);

console.log(`[sync-users] Target: ${targetFile}`);
console.log(`[sync-users] Writing ${correctUsersData.users.length} users to Volume`);

correctUsersData.users.forEach((user, i) => {
  console.log(`[sync-users]   ${i + 1}. ${user.email} (${user.role})`);
});

const targetDir = path.dirname(targetFile);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`[sync-users] Created target directory: ${targetDir}`);
}

try {
  // Write correct data directly to target file (overwrites Volume content)
  fs.writeFileSync(targetFile, JSON.stringify(correctUsersData, null, 2), 'utf8');
  console.log(`[sync-users] ✅ Users file written to ${targetFile}`);
  
  // Verify the written file
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
  console.error('[sync-users] ❌ Failed to write users file:', error);
  process.exit(1);
}
