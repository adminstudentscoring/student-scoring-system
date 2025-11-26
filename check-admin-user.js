/**
 * Check admin user in users.txt
 * Usage: node check-admin-user.js
 */
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const USERS_FILE = path.join(__dirname, process.env.USERS_FILE || 'data/users.txt');

async function checkAdminUser() {
  try {
    console.log('🔍 Checking admin user in Volume...\n');
    
    // Read users file
    const content = await fs.readFile(USERS_FILE, 'utf8');
    const data = JSON.parse(content);
    
    console.log(`📊 Total users: ${data.users.length}\n`);
    
    // Find all admin users
    const adminUsers = data.users.filter(u => u.role === 'admin');
    
    if (adminUsers.length === 0) {
      console.log('❌ No admin users found in Volume!\n');
      console.log('All users:');
      data.users.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.email} (${user.role})`);
      });
      return;
    }
    
    console.log(`✅ Found ${adminUsers.length} admin user(s):\n`);
    
    adminUsers.forEach((admin, index) => {
      console.log(`Admin ${index + 1}:`);
      console.log(`  ID: ${admin.id}`);
      console.log(`  Email: ${admin.email}`);
      console.log(`  Name: ${admin.name || 'N/A'}`);
      console.log(`  Password Hash: ${admin.password.substring(0, 20)}...`);
      console.log(`  Created: ${admin.createdAt || 'N/A'}`);
      console.log('');
    });
    
    // Check specifically for admin@studentscoring.com
    const targetAdmin = adminUsers.find(u => u.email === 'admin@studentscoring.com');
    
    if (targetAdmin) {
      console.log('✅ Found admin@studentscoring.com!');
      console.log(`   Password hash: ${targetAdmin.password}`);
    } else {
      console.log('❌ admin@studentscoring.com NOT found!');
      console.log('   Available admin emails:');
      adminUsers.forEach(admin => {
        console.log(`     - ${admin.email}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ENOENT') {
      console.error('   File not found! Make sure the file exists.');
    }
    process.exit(1);
  }
}

checkAdminUser();

