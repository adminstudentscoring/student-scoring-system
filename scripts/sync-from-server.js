/**
 * Sync data from Railway Volume (server) to local files
 * 1. Fetch organizations from server and overwrite local
 * 2. Fetch students from server and merge with local
 * 3. Associate old students without organizationId to V.Chess Academy
 * 
 * Usage: node scripts/sync-from-server.js
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

// Configuration
const API_BASE = process.env.API_BASE || 'https://www.studentscoring.com/api';
const ADMIN_EMAIL = 'admin@studentscoring.com';
const ADMIN_PASSWORD = 'C25da1212';

const DATA_DIR = path.join(__dirname, '..', 'data');
const ORGANIZATIONS_FILE = path.join(DATA_DIR, 'organizations.txt');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.txt');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Login and get authentication token
async function login(email, password) {
  try {
    log(`🔐 Logging in as ${email}...`, 'cyan');
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    log('✅ Login successful!', 'green');
    return data.token;
  } catch (error) {
    log(`❌ Login error: ${error.message}`, 'red');
    throw error;
  }
}

// Fetch organizations from server
async function fetchOrganizations(token) {
  try {
    log('📡 Fetching organizations from server...', 'cyan');
    const response = await fetch(`${API_BASE}/admin/organizations`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch organizations');
    }

    const organizations = await response.json();
    log(`✅ Fetched ${organizations.length} organization(s) from server`, 'green');
    return organizations;
  } catch (error) {
    log(`❌ Error fetching organizations: ${error.message}`, 'red');
    throw error;
  }
}

// Fetch students from server
async function fetchStudents(token) {
  try {
    log('📡 Fetching students from server...', 'cyan');
    const response = await fetch(`${API_BASE}/students`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch students');
    }

    const students = await response.json();
    log(`✅ Fetched ${students.length} student(s) from server`, 'green');
    return Array.isArray(students) ? students : [];
  } catch (error) {
    log(`❌ Error fetching students: ${error.message}`, 'red');
    throw error;
  }
}

// Read local students data
async function readLocalStudents() {
  try {
    log('📖 Reading local students data...', 'cyan');
    const content = await fs.readFile(STUDENTS_FILE, 'utf8');
    const data = JSON.parse(content);
    const students = data.students || [];
    log(`✅ Found ${students.length} student(s) in local data`, 'green');
    return { students, otherData: { ...data, students: undefined } };
  } catch (error) {
    log(`⚠️  Error reading local students: ${error.message}, using empty array`, 'yellow');
    return { students: [], otherData: { battles: [], challenge: {}, lastUpdate: new Date().toISOString() } };
  }
}

// Write organizations to local file
async function writeOrganizations(organizations) {
  try {
    // Remove enriched fields (teacherCount, studentCount, userCount) before saving
    const cleanOrganizations = organizations.map(org => {
      const { teacherCount, studentCount, userCount, ...cleanOrg } = org;
      return cleanOrg;
    });

    const data = {
      organizations: cleanOrganizations,
      lastUpdate: new Date().toISOString()
    };

    await fs.writeFile(ORGANIZATIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    log(`✅ Wrote ${cleanOrganizations.length} organization(s) to local file`, 'green');
  } catch (error) {
    log(`❌ Error writing organizations: ${error.message}`, 'red');
    throw error;
  }
}

// Merge students: keep local students' full data, add server students as supplement
async function mergeStudents(localData, serverStudents) {
  try {
    log('🔄 Merging students data...', 'cyan');
    
    const localStudents = localData.students || [];
    const serverStudentsMap = new Map();
    
    // Create a map of server students by studentId for quick lookup
    serverStudents.forEach(s => {
      if (s.studentId) {
        serverStudentsMap.set(s.studentId, s);
      }
    });

    // Merge strategy:
    // 1. Keep all local students with their full data
    // 2. Add server students that don't exist locally (by studentId)
    const mergedStudents = [...localStudents];
    const addedFromServer = [];

    serverStudents.forEach(serverStudent => {
      if (serverStudent.studentId) {
        const exists = localStudents.some(local => local.studentId === serverStudent.studentId);
        if (!exists) {
          mergedStudents.push(serverStudent);
          addedFromServer.push(serverStudent.studentId);
        }
      }
    });

    log(`   - Local students: ${localStudents.length}`, 'cyan');
    log(`   - Server students: ${serverStudents.length}`, 'cyan');
    log(`   - Added from server: ${addedFromServer.length}`, 'cyan');
    log(`   - Total merged: ${mergedStudents.length}`, 'green');

    return mergedStudents;
  } catch (error) {
    log(`❌ Error merging students: ${error.message}`, 'red');
    throw error;
  }
}

// Find V.Chess Academy organization
function findVChessAcademy(organizations) {
  const vchess = organizations.find(org => 
    org.name && (
      org.name.toLowerCase().includes('v.chess') || 
      org.name.toLowerCase().includes('vchess') ||
      org.name.toLowerCase() === 'v.chess academy' ||
      org.name.toLowerCase() === 'vchess academy'
    )
  );
  
  if (vchess) {
    log(`✅ Found V.Chess Academy: ${vchess.name} (ID: ${vchess.id})`, 'green');
  } else {
    log(`⚠️  V.Chess Academy not found in organizations`, 'yellow');
    log(`   Available organizations:`, 'yellow');
    organizations.forEach(org => {
      log(`   - ${org.name} (ID: ${org.id})`, 'yellow');
    });
  }
  
  return vchess;
}

// Associate old students to V.Chess Academy
async function associateStudentsToVChess(students, vchessOrg) {
  if (!vchessOrg) {
    log('⚠️  Cannot associate students: V.Chess Academy not found', 'yellow');
    return { students, updatedCount: 0 };
  }

  log(`🔗 Associating students to V.Chess Academy...`, 'cyan');
  
  let updatedCount = 0;
  const updatedStudents = students.map(student => {
    // Only update students without organizationId
    if (!student.organizationId) {
      updatedCount++;
      return {
        ...student,
        organizationId: vchessOrg.id
      };
    }
    return student;
  });

  log(`✅ Associated ${updatedCount} student(s) to V.Chess Academy`, 'green');
  return { students: updatedStudents, updatedCount };
}

// Update organization's students array
async function updateOrganizationStudents(organizations, students, vchessOrg) {
  if (!vchessOrg) {
    return organizations;
  }

  log(`📝 Updating V.Chess Academy students array...`, 'cyan');
  
  // Get all student IDs that belong to V.Chess Academy
  const vchessStudentIds = students
    .filter(s => s.organizationId === vchessOrg.id)
    .map(s => s.id);

  // Update the organization
  const updatedOrganizations = organizations.map(org => {
    if (org.id === vchessOrg.id) {
      // Merge with existing students array (avoid duplicates)
      const existingIds = new Set(org.students || []);
      vchessStudentIds.forEach(id => existingIds.add(id));
      return {
        ...org,
        students: Array.from(existingIds)
      };
    }
    return org;
  });

  const vchessOrgUpdated = updatedOrganizations.find(o => o.id === vchessOrg.id);
  log(`✅ V.Chess Academy now has ${vchessOrgUpdated.students.length} student(s)`, 'green');
  
  return updatedOrganizations;
}

// Write students to local file
async function writeStudents(students, otherData) {
  try {
    const data = {
      ...otherData,
      students: students,
      lastUpdate: new Date().toISOString()
    };

    await fs.writeFile(STUDENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    log(`✅ Wrote ${students.length} student(s) to local file`, 'green');
  } catch (error) {
    log(`❌ Error writing students: ${error.message}`, 'red');
    throw error;
  }
}

// Main sync function
async function syncFromServer() {
  try {
    log('\n🚀 Starting data sync from server...\n', 'blue');
    log(`📡 API Base: ${API_BASE}\n`, 'cyan');

    // Step 1: Login
    const token = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Step 2: Fetch organizations from server
    const serverOrganizations = await fetchOrganizations(token);
    
    // Step 3: Write organizations to local (overwrite)
    await writeOrganizations(serverOrganizations);

    // Step 4: Find V.Chess Academy
    const vchessOrg = findVChessAcademy(serverOrganizations);
    
    if (!vchessOrg) {
      log('\n❌ V.Chess Academy not found. Please create it on the website first.', 'red');
      process.exit(1);
    }

    // Step 5: Fetch students from server
    const serverStudents = await fetchStudents(token);

    // Step 6: Read local students
    const localData = await readLocalStudents();

    // Step 7: Merge students
    const mergedStudents = await mergeStudents(localData, serverStudents);

    // Step 8: Associate old students to V.Chess Academy
    const { students: associatedStudents, updatedCount } = await associateStudentsToVChess(mergedStudents, vchessOrg);

    // Step 9: Update organization's students array
    const updatedOrganizations = await updateOrganizationStudents(serverOrganizations, associatedStudents, vchessOrg);

    // Step 10: Write updated organizations
    await writeOrganizations(updatedOrganizations);

    // Step 11: Write students
    await writeStudents(associatedStudents, localData.otherData);

    // Summary
    log('\n✅ Sync completed successfully!', 'green');
    log(`   - Organizations: ${updatedOrganizations.length}`, 'green');
    log(`   - Students: ${associatedStudents.length}`, 'green');
    log(`   - Students associated to V.Chess Academy: ${updatedCount}`, 'green');
    log(`   - V.Chess Academy student count: ${vchessOrg.students ? vchessOrg.students.length : 0}`, 'green');
    log('\n', 'reset');

  } catch (error) {
    log(`\n❌ Sync failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run the sync
syncFromServer();

