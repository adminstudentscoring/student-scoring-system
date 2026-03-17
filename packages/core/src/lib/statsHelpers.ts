// Statistics helper functions extracted from server.js.

import { RANKS } from '../config/constants';

interface StatEntry {
  answerCount: number;
  totalPoints: number;
}

interface StudentStats {
  daily: Record<string, StatEntry>;
  weekly: Record<string, StatEntry>;
  monthly: Record<string, StatEntry>;
  yearly: Record<string, StatEntry>;
}

interface StudentWithStats {
  stats?: StudentStats;
  [key: string]: any; // TODO: tighten when Student interface is shared
}

interface RankInfo {
  rank: string;
  rankIndex: number;
  currentScore: number;
  minScore: number;
  maxScore: number;
  progress: number;
  nextRank: string | null;
  scoreToNext: number;
}

// Statistics Helper Functions
function getDateKey(date: Date | string | number = new Date()): string {
  // Returns YYYY-MM-DD format
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekKey(date: Date | string | number = new Date()): string {
  // Returns YYYY-Www format (Monday as start of week)
  // Simple approach: calculate week number based on days since year start
  const d = new Date(date);
  const year = d.getFullYear();
  
  // Get the Monday of the current week
  const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  // Calculate days to Monday: if Sunday (0), go back 6 days; if Monday (1), 0 days; otherwise go back (dayOfWeek - 1) days
  const daysToMonday = dayOfWeek === 0 ? -6 : (dayOfWeek === 1 ? 0 : 1 - dayOfWeek);
  const mondayDate = new Date(d);
  mondayDate.setDate(d.getDate() + daysToMonday);
  
  // Get January 1st of the year
  const jan1 = new Date(year, 0, 1);
  const jan1DayOfWeek = jan1.getDay();
  
  // Calculate first Monday of the year
  const daysToFirstMonday = jan1DayOfWeek === 0 ? 1 : (jan1DayOfWeek === 1 ? 0 : 8 - jan1DayOfWeek);
  const firstMonday = new Date(year, 0, 1 + daysToFirstMonday);
  
  // Calculate week number
  const daysDiff = Math.floor((mondayDate.getTime() - firstMonday.getTime()) / (24 * 60 * 60 * 1000));
  let weekNumber = Math.floor(daysDiff / 7) + 1;
  
  // Ensure week number is valid
  if (weekNumber < 1) {
    weekNumber = 1;
  }
  if (weekNumber > 52) {
    weekNumber = 52;
  }
  
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

function getMonthKey(date: Date | string | number = new Date()): string {
  // Returns YYYY-MM format
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getYearKey(date: Date | string | number = new Date()): string {
  // Returns YYYY format
  const d = new Date(date);
  return d.getFullYear().toString();
}

function updateStudentStats(student: StudentWithStats, points: number): void {
  // Initialize stats if not exists
  if (!student.stats) {
    student.stats = {
      daily: {},
      weekly: {},
      monthly: {},
      yearly: {}
    };
  }
  
  const now = new Date();
  const dateKey = getDateKey(now);
  const weekKey = getWeekKey(now);
  const monthKey = getMonthKey(now);
  const yearKey = getYearKey(now);
  
  // Update daily stats
  if (!student.stats.daily[dateKey]) {
    student.stats.daily[dateKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.daily[dateKey].answerCount += 1;
  student.stats.daily[dateKey].totalPoints += points;
  
  // Update weekly stats
  if (!student.stats.weekly[weekKey]) {
    student.stats.weekly[weekKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.weekly[weekKey].answerCount += 1;
  student.stats.weekly[weekKey].totalPoints += points;
  
  // Update monthly stats
  if (!student.stats.monthly[monthKey]) {
    student.stats.monthly[monthKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.monthly[monthKey].answerCount += 1;
  student.stats.monthly[monthKey].totalPoints += points;

  // Update yearly stats
  if (!student.stats.yearly) student.stats.yearly = {};
  if (!student.stats.yearly[yearKey]) {
    student.stats.yearly[yearKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.yearly[yearKey].answerCount += 1;
  student.stats.yearly[yearKey].totalPoints += points;
}

function addRewardPointsToStats(student: StudentWithStats, points: number): void {
  if (!student.stats) {
    student.stats = {
      daily: {},
      weekly: {},
      monthly: {},
      yearly: {}
    };
  }

  const now = new Date();
  const dateKey = getDateKey(now);
  const weekKey = getWeekKey(now);
  const monthKey = getMonthKey(now);
  const yearKey = getYearKey(now);

  if (!student.stats.daily[dateKey]) {
    student.stats.daily[dateKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.daily[dateKey].totalPoints += points;

  if (!student.stats.weekly[weekKey]) {
    student.stats.weekly[weekKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.weekly[weekKey].totalPoints += points;

  if (!student.stats.monthly[monthKey]) {
    student.stats.monthly[monthKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.monthly[monthKey].totalPoints += points;

  if (!student.stats.yearly) student.stats.yearly = {};
  if (!student.stats.yearly[yearKey]) {
    student.stats.yearly[yearKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.yearly[yearKey].totalPoints += points;
}

// Get rank information based on score
function getRankInfo(score: number): RankInfo {
  for (let i = 0; i < RANKS.length; i++) {
    if (score <= RANKS[i].maxScore) {
      const currentRank = RANKS[i];
      const prevRank = i > 0 ? RANKS[i - 1] : { maxScore: 0 };
      const progress = i === 0 
        ? (score / currentRank.maxScore) * 100
        : ((score - prevRank.maxScore) / (currentRank.maxScore - prevRank.maxScore)) * 100;
      const nextRank = i < RANKS.length - 1 ? RANKS[i + 1] : null;
      
      return {
        rank: currentRank.name,
        rankIndex: i,
        currentScore: score,
        minScore: i === 0 ? 0 : prevRank.maxScore,
        maxScore: currentRank.maxScore,
        progress: Math.min(100, Math.max(0, progress)),
        nextRank: nextRank ? nextRank.name : null,
        scoreToNext: nextRank && Number.isFinite(currentRank.maxScore) ? Math.max(0, currentRank.maxScore - score) : 0
      };
    }
  }
  return {
    rank: 'Grand Master',
    rankIndex: RANKS.length - 1,
    currentScore: score,
    minScore: RANKS[RANKS.length - 2].maxScore,
    maxScore: Infinity,
    progress: 100,
    nextRank: null,
    scoreToNext: 0
  };
}

export {
  getDateKey,
  getWeekKey,
  getMonthKey,
  getYearKey,
  updateStudentStats,
  addRewardPointsToStats,
  getRankInfo
};
