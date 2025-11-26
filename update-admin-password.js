/**
 * Update admin password in users.txt
 * Usage: node update-admin-password.js <newPassword>
 */
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { hashPassword } = require('./auth');

const USERS_FILE = path.join(__dirname, process.env.USERS_FILE || 'data/users.txt');
const NEW_PASSWORD = process.argv[2] || 'C25da1212';

async function updateAdminPassword() {
  try {
    console.log('🔧 Updating admin password...\n');
    
    // Read users file
    const content = await fs.readFile(USERS_FILE, 'utf8');
    const data = JSON.parse(content);
    
    // Find admin user
    const adminIndex = data.users.findIndex(u => u.role === 'admin' && u.email === 'admin@studentscoring.com');
    
    if (adminIndex === -1) {
      console.log('❌ Admin user not found');
      return;
    }
    
    console.log('✅ Found admin user');
    console.log(`   Email: ${data.users[adminIndex].email}`);
    console.log(`   Name: ${data.users[adminIndex].name}\n`);
    
    // Hash new password
    const hashedPassword = await hashPassword(NEW_PASSWORD);
    
    // Update password
    data.users[adminIndex].password = hashedPassword;
    data.lastUpdate = new Date().toISOString();
    
    // Save file
    await fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    
    console.log('✅ Admin password updated successfully!');
    console.log(`\n   New password: ${NEW_PASSWORD}`);
    console.log('   You can now login with the new password.');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateAdminPassword();

