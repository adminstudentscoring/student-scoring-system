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

const API_BASE: string = process.env.API_BASE || 'https://www.studentscoring.com/api';
const ADMIN_EMAIL = 'admin@studentscoring.com';
const ADMIN_PASSWORD = 'C25da1212';

const DATA_DIR: string = path.join(__dirname, '..', 'data');
const ORGANIZATIONS_FILE: string = path.join(DATA_DIR, 'organizations.txt');
const STUDENTS_FILE: string = path.join(DATA_DIR, 'students.txt');

const colors: Record<string, string> = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message: string, color: string = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function login(email: string, password: string): Promise<string> {
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
  } catch (error: any) {
    log(`❌ Login error: ${error.message}`, 'red');
    throw error;
  }
}

async function fetchOrganizations(token: string): Promise<any[]> {
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

    const organizations: any[] = await response.json();
    log(`✅ Fetched ${organizations.length} organization(s) from server`, 'green');
    return organizations;
  } catch (error: any) {
    log(`❌ Error fetching organizations: ${error.message}`, 'red');
    throw error;
  }
}

async function fetchStudents(token: string): Promise<any[]> {
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
  } catch (error: any) {
    log(`❌ Error fetching students: ${error.message}`, 'red');
    throw error;
  }
}

async function readLocalStudents(): Promise<{ students: any[]; otherData: any }> {
  try {
    log('📖 Reading local students data...', 'cyan');
    const content: string = await fs.readFile(STUDENTS_FILE, 'utf8');
    const data = JSON.parse(content);
    const students: any[] = data.students || [];
    log(`✅ Found ${students.length} student(s) in local data`, 'green');
    return { students, otherData: { ...data, students: undefined } };
  } catch (error: any) {
    log(`⚠️  Error reading local students: ${error.message}, using empty array`, 'yellow');
    return { students: [], otherData: { battles: [], challenge: {}, lastUpdate: new Date().toISOString() } };
  }
}

async function writeOrganizations(organizations: any[]): Promise<void> {
  try {
    const cleanOrganizations = organizations.map((org: any) => {
      const { teacherCount, studentCount, userCount, ...cleanOrg } = org;
      return cleanOrg;
    });

    const data = {
      organizations: cleanOrganizations,
      lastUpdate: new Date().toISOString()
    };

    await fs.writeFile(ORGANIZATIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    log(`✅ Wrote ${cleanOrganizations.length} organization(s) to local file`, 'green');
  } catch (error: any) {
    log(`❌ Error writing organizations: ${error.message}`, 'red');
    throw error;
  }
}

async function mergeStudents(localData: { students: any[]; otherData: any }, serverStudents: any[]): Promise<any[]> {
  try {
    log('🔄 Merging students data...', 'cyan');
    
    const localStudents: any[] = localData.students || [];
    const serverStudentsMap = new Map<string, any>();
    
    serverStudents.forEach((s: any) => {
      const chessComId = (s.chessComId || s.studentId || '').toString();
      if (chessComId) serverStudentsMap.set(chessComId, s);
    });

    const mergedStudents = [...localStudents];
    const addedFromServer: string[] = [];

    serverStudents.forEach((serverStudent: any) => {
      const chessComId = (serverStudent.chessComId || serverStudent.studentId || '').toString();
      if (chessComId) {
        const exists = localStudents.some((local: any) => (local.chessComId || local.studentId || '').toString() === chessComId);
        if (!exists) {
          mergedStudents.push(serverStudent);
          addedFromServer.push(chessComId);
        }
      }
    });

    log(`   - Local students: ${localStudents.length}`, 'cyan');
    log(`   - Server students: ${serverStudents.length}`, 'cyan');
    log(`   - Added from server: ${addedFromServer.length}`, 'cyan');
    log(`   - Total merged: ${mergedStudents.length}`, 'green');

    return mergedStudents;
  } catch (error: any) {
    log(`❌ Error merging students: ${error.message}`, 'red');
    throw error;
  }
}

function findVChessAcademy(organizations: any[]): any | undefined {
  const vchess = organizations.find((org: any) => 
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
    organizations.forEach((org: any) => {
      log(`   - ${org.name} (ID: ${org.id})`, 'yellow');
    });
  }
  
  return vchess;
}

async function associateStudentsToVChess(students: any[], vchessOrg: any): Promise<{ students: any[]; updatedCount: number }> {
  if (!vchessOrg) {
    log('⚠️  Cannot associate students: V.Chess Academy not found', 'yellow');
    return { students, updatedCount: 0 };
  }

  log(`🔗 Associating students to V.Chess Academy...`, 'cyan');
  
  let updatedCount = 0;
  const updatedStudents = students.map((student: any) => {
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

async function updateOrganizationStudents(organizations: any[], students: any[], vchessOrg: any): Promise<any[]> {
  if (!vchessOrg) {
    return organizations;
  }

  log(`📝 Updating V.Chess Academy students array...`, 'cyan');
  
  const vchessStudentIds: string[] = students
    .filter((s: any) => s.organizationId === vchessOrg.id)
    .map((s: any) => s.id);

  const updatedOrganizations = organizations.map((org: any) => {
    if (org.id === vchessOrg.id) {
      const existingIds = new Set<string>(org.students || []);
      vchessStudentIds.forEach((id: string) => existingIds.add(id));
      return {
        ...org,
        students: Array.from(existingIds)
      };
    }
    return org;
  });

  const vchessOrgUpdated = updatedOrganizations.find((o: any) => o.id === vchessOrg.id);
  log(`✅ V.Chess Academy now has ${vchessOrgUpdated.students.length} student(s)`, 'green');
  
  return updatedOrganizations;
}

async function writeStudents(students: any[], otherData: any): Promise<void> {
  try {
    const data = {
      ...otherData,
      students: students,
      lastUpdate: new Date().toISOString()
    };

    await fs.writeFile(STUDENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    log(`✅ Wrote ${students.length} student(s) to local file`, 'green');
  } catch (error: any) {
    log(`❌ Error writing students: ${error.message}`, 'red');
    throw error;
  }
}

async function syncFromServer(): Promise<void> {
  try {
    log('\n🚀 Starting data sync from server...\n', 'blue');
    log(`📡 API Base: ${API_BASE}\n`, 'cyan');

    const token = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

    const serverOrganizations = await fetchOrganizations(token);
    
    await writeOrganizations(serverOrganizations);

    const vchessOrg = findVChessAcademy(serverOrganizations);
    
    if (!vchessOrg) {
      log('\n❌ V.Chess Academy not found. Please create it on the website first.', 'red');
      process.exit(1);
    }

    const serverStudents = await fetchStudents(token);

    const localData = await readLocalStudents();

    const mergedStudents = await mergeStudents(localData, serverStudents);

    const { students: associatedStudents, updatedCount } = await associateStudentsToVChess(mergedStudents, vchessOrg);

    const updatedOrganizations = await updateOrganizationStudents(serverOrganizations, associatedStudents, vchessOrg);

    await writeOrganizations(updatedOrganizations);

    await writeStudents(associatedStudents, localData.otherData);

    log('\n✅ Sync completed successfully!', 'green');
    log(`   - Organizations: ${updatedOrganizations.length}`, 'green');
    log(`   - Students: ${associatedStudents.length}`, 'green');
    log(`   - Students associated to V.Chess Academy: ${updatedCount}`, 'green');
    log(`   - V.Chess Academy student count: ${vchessOrg.students ? vchessOrg.students.length : 0}`, 'green');
    log('\n', 'reset');

  } catch (error: any) {
    log(`\n❌ Sync failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

syncFromServer();

