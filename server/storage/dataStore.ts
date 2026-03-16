// Data store (readData, writeData, initializeDataFile, initializeStudentFields)
// extracted from server.js. Handles file-based storage for students.txt with
// queue protection and schema migration logic.

const { LEVELS } = require('../config/constants');

interface Student {
  id?: string;
  name?: string;
  localName?: string;
  contactPhoneCountry?: string;
  contactPhoneCountryCode?: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  chessComId?: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactNumber?: string | null;
  remark?: string | null;
  membership?: string | null;
  membershipStartDate?: string | null;
  membershipEndDate?: string | null;
  organizationId?: string;
  autoRenewEnabled?: boolean;
  autoRenewTimetableEntryId?: string;
  autoRenewPackageId?: string;
  stats?: {
    daily: Record<string, any>;
    weekly: Record<string, any>;
    monthly: Record<string, any>;
    yearly?: Record<string, any>;
  };
  studentId?: string; // legacy field for migration
  [key: string]: any; // TODO: tighten as migration completes
}

interface Challenge {
  currentLevel: number;
  currentHP: number;
  completedLevels: number[];
  totalDamage: number;
}

interface DataFile {
  students: Student[];
  battles: any[]; // TODO: define Battle interface
  challenge?: Challenge;
  lastUpdate?: string;
}

interface FileSystem {
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, data: string, encoding: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  access(path: string): Promise<void>;
}

interface DataStoreDeps {
  fs: FileSystem;
  DATA_FILE: string;
}

interface DataStoreReturn {
  readData(): Promise<DataFile>;
  writeData(data: DataFile): Promise<boolean>;
  initializeDataFile(): Promise<void>;
  initializeStudentFields(student: Student): Student;
}

function createDataStore({ fs, DATA_FILE }: DataStoreDeps): DataStoreReturn {
  // File operation queue to prevent concurrent read/write conflicts
  let dataFileQueue: Promise<any> = Promise.resolve();
  let isWriting = false;

  // Initialize student fields (add new fields if missing)
  function initializeStudentFields(student: Student): Student {
    // ===== One-time schema migration: studentId -> chessComId =====
    if (student && typeof student === 'object') {
      const hasChess = Object.prototype.hasOwnProperty.call(student, 'chessComId');
      const hasLegacy = Object.prototype.hasOwnProperty.call(student, 'studentId');
      if (!hasChess && hasLegacy) {
        const legacy = student.studentId;
        student.chessComId = legacy == null ? '' : String(legacy);
      }
      if (hasLegacy) {
        delete student.studentId;
      }
    }

    const newFields: Record<string, any> = {
      localName: '',
      contactPhoneCountry: 'HK',
      contactPhoneCountryCode: '+852',
      dateOfBirth: null,
      gender: null,
      chessComId: '',
      contactPhone: null,
      contactEmail: null,
      emergencyContactName: null,
      emergencyContactRelation: null,
      emergencyContactNumber: null,
      remark: null,
      membership: null,
      membershipStartDate: null,
      membershipEndDate: null
    };

    Object.keys(newFields).forEach(key => {
      if (!(key in student)) {
        (student as any)[key] = newFields[key];
      }
    });

    return student;
  }

  // Write data to txt file with queue protection
  async function writeData(data: DataFile): Promise<boolean> {
    dataFileQueue = dataFileQueue.then(async () => {
      isWriting = true;
      try {
        if (data.students && Array.isArray(data.students)) {
          data.students.forEach(student => {
            initializeStudentFields(student);
          });
        }

        const tempFile = DATA_FILE + '.tmp';
        const jsonContent = JSON.stringify(data, null, 2);

        await fs.writeFile(tempFile, jsonContent, 'utf8');
        await fs.rename(tempFile, DATA_FILE);

        return true;
      } catch (error) {
        console.error('Error writing data:', error);
        try {
          await fs.unlink(DATA_FILE + '.tmp').catch(() => {});
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        return false;
      } finally {
        isWriting = false;
      }
    });

    return await dataFileQueue;
  }

  // Read data from txt file with queue protection
  async function readData(): Promise<DataFile> {
    await dataFileQueue;

    try {
      const content = await fs.readFile(DATA_FILE, 'utf8');

      if (!content || content.trim() === '') {
        console.warn('Data file is empty, returning default data');
        return { students: [], battles: [], lastUpdate: new Date().toISOString() };
      }

      let data: DataFile;
      try {
        data = JSON.parse(content);
      } catch (parseError: any) {
        console.error('JSON parse error - file may be corrupted or incomplete:', parseError.message);
        console.error('File content length:', content.length);
        console.error('File content preview:', content.substring(0, 200));
        return { students: [], battles: [], lastUpdate: new Date().toISOString() };
      }

      if (!data || typeof data !== 'object') {
        console.error('Invalid data structure, returning default');
        return { students: [], battles: [], lastUpdate: new Date().toISOString() };
      }

      const needsStudentIdMigration = !!(
        data.students &&
        Array.isArray(data.students) &&
        data.students.some((s: Student) => s && typeof s === 'object' && Object.prototype.hasOwnProperty.call(s, 'studentId'))
      );

      if (data.students && Array.isArray(data.students)) {
        data.students.forEach(student => {
          initializeStudentFields(student);
        });
      }

      if (needsStudentIdMigration) {
        try {
          await writeData(data);
        } catch (e: any) {
          console.warn('Unable to persist studentId->chessComId migration:', e?.message || e);
        }
      }

      return data;
    } catch (error) {
      console.error('Error reading data:', error);
      return { students: [], battles: [], lastUpdate: new Date().toISOString() };
    }
  }

  // Initialize data file if it doesn't exist
  async function initializeDataFile(): Promise<void> {
    try {
      await fs.access(DATA_FILE);
      const data = await readData();
      if (!data.challenge) {
        data.challenge = {
          currentLevel: 1,
          currentHP: LEVELS[0].maxHP,
          completedLevels: [],
          totalDamage: 0
        };
        await writeData(data);
      } else {
        const currentLevelInfo = LEVELS[data.challenge.currentLevel - 1] || LEVELS[0];
        if (data.challenge.currentHP > currentLevelInfo.maxHP) {
          data.challenge.currentHP = currentLevelInfo.maxHP;
          data.lastUpdate = new Date().toISOString();
          await writeData(data);
        }

        let needsMigration = false;
        data.students.forEach((student: Student) => {
          if (!student.stats) {
            student.stats = {
              daily: {},
              weekly: {},
              monthly: {}
            };
            needsMigration = true;
          }
        });

        if (needsMigration) {
          data.lastUpdate = new Date().toISOString();
          await writeData(data);
          console.log('✅ Migrated student statistics data');
        }
      }
    } catch {
      const initialData: DataFile = {
        students: [],
        battles: [],
        challenge: {
          currentLevel: 1,
          currentHP: LEVELS[0].maxHP,
          completedLevels: [],
          totalDamage: 0
        },
        lastUpdate: new Date().toISOString()
      };
      await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf8');
    }
  }

  return { readData, writeData, initializeDataFile, initializeStudentFields };
}

module.exports = { createDataStore };
