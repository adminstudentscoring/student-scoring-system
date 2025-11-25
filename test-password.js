/**
 * Test script to verify password hash
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');

const USERS_FILE = path.join(__dirname, 'data', 'users.txt');
const TEST_PASSWORD = 'C25da1212';
const TEST_HASH = '$2b$10$sr9Au0xHHPfq.V.5at3aHuyQiHMnKke.8iq8/u5G7TmUB57VSZH0u';

async function testPassword() {
  try {
    console.log('🔍 Testing password verification...\n');
    
    // Test 1: Verify the hash matches the password
    console.log('Test 1: Verifying password hash...');
    const isValid = await bcrypt.compare(TEST_PASSWORD, TEST_HASH);
    console.log(`Password "${TEST_PASSWORD}" matches hash: ${isValid}\n`);
    
    // Test 2: Read users file and find admin user
    console.log('Test 2: Reading users file...');
    const content = await fs.readFile(USERS_FILE, 'utf8');
    const data = JSON.parse(content);
    const adminUser = data.users.find(u => u.role === 'admin' && u.email === 'admin@studentscoring.com');
    
    if (!adminUser) {
      console.log('❌ Admin user not found in users.txt');
      return;
    }
    
    console.log('✅ Admin user found:');
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Name: ${adminUser.name}`);
    console.log(`   Hash: ${adminUser.password}\n`);
    
    // Test 3: Verify password with user's hash
    console.log('Test 3: Verifying password with user\'s hash...');
    const isValidWithUserHash = await bcrypt.compare(TEST_PASSWORD, adminUser.password);
    console.log(`Password "${TEST_PASSWORD}" matches user's hash: ${isValidWithUserHash}\n`);
    
    // Test 4: Try to hash the password again to see if it's different
    console.log('Test 4: Creating new hash for comparison...');
    const newHash = await bcrypt.hash(TEST_PASSWORD, 10);
    console.log(`New hash: ${newHash}`);
    console.log(`Hashes are different (expected): ${newHash !== adminUser.password}\n`);
    
    // Test 5: Verify new hash also works
    const isValidWithNewHash = await bcrypt.compare(TEST_PASSWORD, newHash);
    console.log(`Password "${TEST_PASSWORD}" matches new hash: ${isValidWithNewHash}\n`);
    
    if (isValidWithUserHash) {
      console.log('✅ Password verification is working correctly!');
      console.log('   The issue might be:');
      console.log('   1. Server not restarted after updating users.txt');
      console.log('   2. Browser cache issues');
      console.log('   3. Case sensitivity in email');
    } else {
      console.log('❌ Password verification failed!');
      console.log('   The hash in users.txt might be incorrect.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testPassword();

