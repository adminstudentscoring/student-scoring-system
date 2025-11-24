/**
 * Initialize Admin User Script
 * Run this script once to create the first admin user
 * 
 * Usage: node scripts/init-admin.js
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { hashPassword } = require('../auth');

const USERS_FILE = path.join(__dirname, '..', process.env.USERS_FILE || 'data/users.txt');

async function initAdmin() {
  try {
    console.log('🔧 Initializing admin user...\n');
    
    // Read existing users
    let users = [];
    try {
      const content = await fs.readFile(USERS_FILE, 'utf8');
      const data = JSON.parse(content);
      users = data.users || [];
    } catch (error) {
      // File doesn't exist, start with empty array
      console.log('📝 Creating new users file...');
    }
    
    // Check if admin already exists
    const existingAdmin = users.find(u => u.role === 'admin');
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.name}`);
      console.log('\n   If you want to create a new admin, please delete the existing one first.');
      return;
    }
    
    // Get admin details from command line arguments or use defaults
    const args = process.argv.slice(2);
    const email = args[0] || 'admin@example.com';
    const password = args[1] || 'admin123456';
    const name = args[2] || 'System Administrator';
    
    console.log('📋 Admin Details:');
    console.log(`   Email: ${email}`);
    console.log(`   Name: ${name}`);
    console.log(`   Password: ${password}`);
    console.log('\n⚠️  Please change the default password after first login!\n');
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create admin user
    const adminUser = {
      id: Date.now().toString(),
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    
    users.push(adminUser);
    
    // Save users
    await fs.writeFile(USERS_FILE, JSON.stringify({ users, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
    
    console.log('✅ Admin user created successfully!');
    console.log(`\n   You can now login with:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log('\n   Remember to change the password after first login!');
    
  } catch (error) {
    console.error('❌ Error initializing admin:', error);
    process.exit(1);
  }
}

// Run the script
initAdmin();

