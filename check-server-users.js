/**
 * Check what users the server is actually reading
 * Usage: node check-server-users.js
 */
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const USERS_FILE = path.join(__dirname, process.env.USERS_FILE || path.join('data', 'users.txt'));

async function checkServerUsers() {
  try {
    console.log('🔍 Checking what users the server is reading...\n');
    console.log(`📁 File path: ${USERS_FILE}`);
    console.log(`📁 Absolute path: ${path.resolve(USERS_FILE)}\n`);
    
    // Check if file exists
    try {
      await fs.access(USERS_FILE);
      console.log('✅ File exists\n');
    } catch {
      console.log('❌ File does NOT exist!\n');
      return;
    }
    
    // Read file
    const content = await fs.readFile(USERS_FILE, 'utf8');
    const data = JSON.parse(content);
    
    console.log(`📊 Total users in file: ${data.users.length}\n`);
    console.log('👥 All users:');
    data.users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.email} (${user.role})`);
      if (user.username) {
        console.log(`     Username: ${user.username}`);
      }
    });
    
    // Check for admin
    const admin = data.users.find(u => 
      u.role === 'admin' && u.email === 'admin@studentscoring.com'
    );
    
    console.log('\n');
    if (admin) {
      console.log('✅ Admin user found in file!');
      console.log(`   Email: ${admin.email}`);
      console.log(`   Name: ${admin.name}`);
    } else {
      console.log('❌ Admin user NOT found in file!');
      console.log('   This is why login is failing.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ENOENT') {
      console.error('   File not found!');
    }
    process.exit(1);
  }
}

checkServerUsers();

