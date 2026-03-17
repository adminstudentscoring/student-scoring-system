/**
 * Student Data Migration Script
 * Migrates students from local data/students.txt to online system
 * 
 * Usage: node scripts/migrate-students.js [organization-email] [password]
 * 
 * Example: node scripts/migrate-students.js vchess@studentscoring.com password123
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const STUDENTS_FILE: string = path.join(__dirname, '..', 'data/students.txt');
const API_BASE: string = process.env.API_BASE || 'https://www.studentscoring.com/api';
const LOCAL_API_BASE = 'http://localhost:3000/api';

let USE_LOCAL: boolean = process.env.USE_LOCAL === 'true' || process.argv.includes('--local');
let BASE_URL: string = USE_LOCAL ? LOCAL_API_BASE : API_BASE;

function updateBaseUrl(useLocal: boolean): void {
  USE_LOCAL = useLocal;
  BASE_URL = USE_LOCAL ? LOCAL_API_BASE : API_BASE;
}

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

async function readLocalStudents(): Promise<any[]> {
  try {
    log('📖 Reading local students data...', 'cyan');
    const content: string = await fs.readFile(STUDENTS_FILE, 'utf8');
    const data = JSON.parse(content);
    const students: any[] = data.students || [];
    log(`✅ Found ${students.length} students in local data`, 'green');
    return students;
  } catch (error: any) {
    log(`❌ Error reading local students: ${error.message}`, 'red');
    throw error;
  }
}

async function login(email: string, password: string): Promise<string> {
  try {
    log(`🔐 Logging in as ${email}...`, 'cyan');
    const response = await fetch(`${BASE_URL}/auth/login`, {
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

async function createStudent(token: string, studentData: any): Promise<any> {
  try {
    const response = await fetch(`${BASE_URL}/organizations/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: studentData.name,
        chessComId: studentData.chessComId ?? studentData.studentId ?? ''
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create student');
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

async function updateStudent(token: string, studentId: string, updates: any): Promise<any> {
  try {
    const response = await fetch(`${BASE_URL}/students/${studentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update student');
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

async function checkStudentExists(token: string, studentId: string): Promise<any | null> {
  try {
    const response = await fetch(`${BASE_URL}/students`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return null;
    }

    const students = await response.json();
    const studentArray: any[] = Array.isArray(students) ? students : (students.students || []);
    return studentArray.find((s: any) => (s.chessComId || s.studentId) === studentId);
  } catch (error) {
    return null;
  }
}

async function migrateStudents(orgEmail: string, password: string): Promise<void> {
  try {
    log('\n🚀 Starting student data migration...\n', 'blue');
    log(`📡 Using API: ${BASE_URL}`, 'cyan');
    log(`📧 Organization: ${orgEmail}\n`, 'cyan');

    const localStudents = await readLocalStudents();
    
    if (localStudents.length === 0) {
      log('⚠️  No students found in local data', 'yellow');
      return;
    }

    const token = await login(orgEmail, password);
    
    log('\n📋 Checking existing students...', 'cyan');
    const existingResponse = await fetch(`${BASE_URL}/students`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    let existingStudents: any[] = [];
    if (existingResponse.ok) {
      const existingData = await existingResponse.json();
      existingStudents = Array.isArray(existingData) ? existingData : (existingData.students || []);
      log(`✅ Found ${existingStudents.length} existing students`, 'green');
    }

    const existingStudentIds = new Set(existingStudents.map((s: any) => (s.chessComId || s.studentId)));
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors: Array<{ student: string; chessComId: string; error: string }> = [];

    log(`\n📝 Processing ${localStudents.length} students...\n`, 'blue');
    
    for (let i = 0; i < localStudents.length; i++) {
      const localStudent = localStudents[i];
      const progress = `[${i + 1}/${localStudents.length}]`;
      
      try {
        const localChess = localStudent.chessComId ?? localStudent.studentId ?? '';
        const existingStudent = existingStudents.find((s: any) => (s.chessComId || s.studentId) === localChess);
        
        let studentId: string;
        let isNew = false;

        if (existingStudent) {
          studentId = existingStudent.id;
          log(`${progress} ⚠️  Student "${localStudent.name}" (${localChess}) already exists, updating...`, 'yellow');
        } else {
          log(`${progress} ➕ Creating student "${localStudent.name}" (${localChess})...`, 'cyan');
          const newStudent = await createStudent(token, localStudent);
          studentId = newStudent.id;
          isNew = true;
          created++;
        }

        const updates = {
          score: localStudent.score || 0,
          level: localStudent.level || 1,
          rank: localStudent.rank || 'Wood',
          rankIndex: localStudent.rankIndex || 0,
          experience: localStudent.experience || localStudent.score || 0,
          answerCount: localStudent.answerCount || 0,
          totalAnswers: localStudent.totalAnswers || 0,
          correctAnswers: localStudent.correctAnswers || 0,
          stats: localStudent.stats || {
            daily: {},
            weekly: {},
            monthly: {}
          }
        };

        await updateStudent(token, studentId, updates);
        
        if (isNew) {
          log(`${progress} ✅ Created and updated "${localStudent.name}"`, 'green');
        } else {
          log(`${progress} ✅ Updated "${localStudent.name}"`, 'green');
          updated++;
        }

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        log(`${progress} ❌ Error processing "${localStudent.name}": ${error.message}`, 'red');
        errors.push({
          student: localStudent.name,
          chessComId: localStudent.chessComId ?? localStudent.studentId ?? '',
          error: error.message
        });
      }
    }

    log('\n' + '='.repeat(60), 'blue');
    log('📊 Migration Summary', 'blue');
    log('='.repeat(60), 'blue');
    log(`✅ Created: ${created}`, 'green');
    log(`🔄 Updated: ${updated}`, 'yellow');
    log(`⏭️  Skipped: ${skipped}`, 'cyan');
    log(`❌ Errors: ${errors.length}`, errors.length > 0 ? 'red' : 'green');
    
    if (errors.length > 0) {
      log('\n❌ Errors Details:', 'red');
      errors.forEach(err => {
        log(`   - ${err.student} (${err.chessComId || ''}): ${err.error}`, 'red');
      });
    }
    
    log('\n✅ Migration completed!', 'green');
    
  } catch (error: any) {
    log(`\n❌ Migration failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function getCredentials(): Promise<{ email: string; password: string }> {
  const CONFIG_FILE = path.join(__dirname, 'migration-config.json');
  
  let email: string | undefined, password: string | undefined;
  try {
    const configContent: string = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(configContent);
    email = config.email;
    password = config.password;
    if (config.useLocal !== undefined) {
      updateBaseUrl(config.useLocal);
    }
    log(`📋 Using credentials from config file`, 'cyan');
  } catch (error) {
    // Config file doesn't exist or invalid, continue to command line/prompt
  }

  const args: string[] = process.argv.slice(2);
  
  const localIndex = args.indexOf('--local');
  if (localIndex !== -1) {
    args.splice(localIndex, 1);
  }

  if (args[0]) email = args[0];
  if (args[1]) password = args[1];

  if (!email || !password) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query: string): Promise<string> => new Promise(resolve => rl.question(query, resolve));

    if (!email) {
      email = await question('Enter organization email: ');
    }
    
    if (!password) {
      password = await question('Enter password: ');
      rl.output.write('\n');
    }

    rl.close();
  }

  if (!email || !password) {
    log('❌ Email and password are required', 'red');
    log('Usage: node scripts/migrate-students.js [email] [password] [--local]', 'yellow');
    log('Or create scripts/migration-config.json with email and password', 'yellow');
    process.exit(1);
  }

  return { email, password };
}

(async () => {
  try {
    const { email, password } = await getCredentials();
    await migrateStudents(email, password);
  } catch (error: any) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
})();

