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

const USERS_FILE: string = path.join(__dirname, '..', process.env.USERS_FILE || 'data/users.txt');

interface UserRecord {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  createdAt: string;
}

interface UsersData {
  users: UserRecord[];
  lastUpdate?: string;
}

async function initAdmin(): Promise<void> {
  try {
    console.log('🔧 Initializing admin user...\n');
    
    let users: UserRecord[] = [];
    try {
      const content: string = await fs.readFile(USERS_FILE, 'utf8');
      const data: UsersData = JSON.parse(content);
      users = data.users || [];
    } catch (error) {
      console.log('📝 Creating new users file...');
    }
    
    const existingAdmin = users.find(u => u.role === 'admin');
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.name}`);
      console.log('\n   If you want to create a new admin, please delete the existing one first.');
      return;
    }
    
    const args = process.argv.slice(2);
    const email: string = args[0] || 'admin@example.com';
    const password: string = args[1] || 'admin123456';
    const name: string = args[2] || 'System Administrator';
    
    console.log('📋 Admin Details:');
    console.log(`   Email: ${email}`);
    console.log(`   Name: ${name}`);
    console.log(`   Password: ${password}`);
    console.log('\n⚠️  Please change the default password after first login!\n');
    
    const hashedPassword: string = await hashPassword(password);
    
    const adminUser: UserRecord = {
      id: Date.now().toString(),
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    
    users.push(adminUser);
    
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

initAdmin();

