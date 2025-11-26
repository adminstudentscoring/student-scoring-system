/**
 * Update Volume users.txt with correct data
 * Usage: node update-volume-users.js
 */
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const USERS_FILE = path.join(__dirname, process.env.USERS_FILE || path.join('data', 'users.txt'));

// Correct users data (from local file)
const correctUsers = {
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

async function updateVolumeUsers() {
  try {
    console.log('🔄 Updating Volume users.txt...\n');
    console.log(`📁 File path: ${USERS_FILE}\n`);
    
    // Write correct data to Volume
    await fs.writeFile(USERS_FILE, JSON.stringify(correctUsers, null, 2), 'utf8');
    
    console.log('✅ Volume users.txt updated successfully!\n');
    console.log(`📊 Total users: ${correctUsers.users.length}`);
    console.log('👥 Users:');
    correctUsers.users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.email} (${user.role})`);
    });
    
    console.log('\n✅ Admin user included!');
    console.log('   Email: admin@studentscoring.com');
    console.log('   Password: C25da1212');
    console.log('\n⚠️  Please restart the server for changes to take effect!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateVolumeUsers();

