/**
 * Verify admin login credentials
 * Usage: node verify-admin-login.js
 */
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { comparePassword } = require('./auth');

const USERS_FILE = path.join(__dirname, process.env.USERS_FILE || 'data/users.txt');
const TEST_PASSWORD = 'C25da1212';

async function verifyAdminLogin() {
  try {
    console.log('🔍 Verifying admin login credentials...\n');
    
    // Read users file
    const content = await fs.readFile(USERS_FILE, 'utf8');
    const data = JSON.parse(content);
    
    // Find admin user
    const admin = data.users.find(u => 
      u.role === 'admin' && u.email === 'admin@studentscoring.com'
    );
    
    if (!admin) {
      console.log('❌ Admin user not found!');
      console.log('\nAvailable users:');
      data.users.forEach(u => {
        console.log(`  - ${u.email} (${u.role})`);
      });
      return;
    }
    
    console.log('✅ Admin user found:');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Name: ${admin.name}`);
    console.log(`   Password Hash: ${admin.password}\n`);
    
    // Test password verification
    console.log(`🔐 Testing password verification...`);
    console.log(`   Testing password: "${TEST_PASSWORD}"`);
    
    const isValid = await comparePassword(TEST_PASSWORD, admin.password);
    
    if (isValid) {
      console.log('✅ Password verification SUCCESSFUL!');
      console.log('   The password hash is correct and should work for login.\n');
      console.log('⚠️  If login still fails, possible causes:');
      console.log('   1. Server not reading from Volume correctly');
      console.log('   2. Server cache issue - need to restart');
      console.log('   3. Different users.txt file being read');
      console.log('   4. Environment variable USERS_FILE pointing to wrong path');
    } else {
      console.log('❌ Password verification FAILED!');
      console.log('   The password hash does NOT match the password.');
      console.log('   This means the password in Volume is incorrect.\n');
      console.log('💡 Solution: Run update-admin-password.js again');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ENOENT') {
      console.error('   File not found! Check USERS_FILE path.');
    }
    process.exit(1);
  }
}

verifyAdminLogin();

