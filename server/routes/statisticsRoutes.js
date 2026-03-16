// Statistics routes extracted from server.js.
// Includes /api/statistics/* routes.

function registerStatisticsRoutes(app, deps) {
  const readData = deps?.readData;
  const getDateKey = deps?.getDateKey;
  const getWeekKey = deps?.getWeekKey;
  const getMonthKey = deps?.getMonthKey;

  if (!app) throw new Error('registerStatisticsRoutes: missing app');
  if (typeof readData !== 'function') throw new Error('registerStatisticsRoutes: missing readData');
  if (typeof getDateKey !== 'function') throw new Error('registerStatisticsRoutes: missing getDateKey');
  if (typeof getWeekKey !== 'function') throw new Error('registerStatisticsRoutes: missing getWeekKey');
  if (typeof getMonthKey !== 'function') throw new Error('registerStatisticsRoutes: missing getMonthKey');

  // Get most active students (MUST be before /api/statistics/:period to avoid route conflict)
  app.get('/api/statistics/active-students', async (req, res) => {
    try {
      // Get period from query parameter
      let period = req.query.period || 'daily';
      
      // Ensure period is a string
      if (Array.isArray(period)) {
        period = period[0];
      }
      if (typeof period !== 'string') {
        period = String(period || 'daily');
      }
      
      // Clean period parameter (remove any trailing characters like :1)
      period = period.split(':')[0].trim().toLowerCase();
      
      // Validate period
      if (!['daily', 'weekly', 'monthly'].includes(period)) {
        console.error('Invalid period validation failed:', {
          original: req.query.period,
          cleaned: period
        });
        return res.status(400).json({ 
          error: 'Invalid period. Use: daily, weekly, or monthly',
          received: req.query.period,
          cleaned: period
        });
      }
      
      const data = await readData();
      const students = data.students || [];
      
      let currentKey;
      try {
        if (period === 'daily') {
          currentKey = getDateKey();
        } else if (period === 'weekly') {
          currentKey = getWeekKey();
        } else {
          currentKey = getMonthKey();
        }
      } catch (error) {
        console.error(`Error calculating ${period} key:`, error);
        return res.status(500).json({ error: `Failed to calculate ${period} key` });
      }
      
      // Get active students for the period
      const statsKey = period === 'daily' ? 'daily' : period === 'weekly' ? 'weekly' : 'monthly';
      
      const activeStudents = students
        .map(student => {
          if (!student.stats || !student.stats[statsKey]) return null;
          
          const periodStats = student.stats[statsKey];
          
          if (periodStats && periodStats[currentKey]) {
            return {
              id: student.id,
              name: student.name,
              studentId: student.studentId,
              answerCount: periodStats[currentKey].answerCount || 0,
              totalPoints: periodStats[currentKey].totalPoints || 0
            };
          }
          return null;
        })
        .filter(s => s !== null && s !== undefined)
        .sort((a, b) => {
          if (b.answerCount !== a.answerCount) {
            return b.answerCount - a.answerCount;
          }
          return b.totalPoints - a.totalPoints;
        })
        .map((student, index) => ({
          ...student,
          rank: index + 1
        }));
      
      res.json({
        period,
        periodKey: currentKey,
        students: activeStudents || []
      });
    } catch (error) {
      console.error('Error getting active students:', error);
      res.status(500).json({ error: 'Failed to get active students' });
    }
  });

  // Get statistics for a specific period
  app.get('/api/statistics/:period', async (req, res) => {
    try {
      let { period } = req.params; // daily, weekly, or monthly
      
      // Clean period parameter
      if (typeof period === 'string') {
        period = period.split(':')[0].trim().toLowerCase();
      }
      
      // Validate period
      if (!['daily', 'weekly', 'monthly'].includes(period)) {
        console.error(`Invalid period received: ${req.params.period} (cleaned: ${period})`);
        return res.status(400).json({ 
          error: 'Invalid period. Use: daily, weekly, or monthly',
          received: req.params.period,
          cleaned: period
        });
      }
      
      const data = await readData();
      const students = data.students || [];
      
      let keyFunction, currentKey;
      try {
        if (period === 'daily') {
          keyFunction = getDateKey;
          currentKey = getDateKey();
        } else if (period === 'weekly') {
          keyFunction = getWeekKey;
          currentKey = getWeekKey();
        } else {
          keyFunction = getMonthKey;
          currentKey = getMonthKey();
        }
      } catch (error) {
        console.error(`Error calculating ${period} key:`, error);
        return res.status(500).json({ error: `Failed to calculate ${period} key` });
      }
      
      // Aggregate statistics from all students
      let totalAnswerCount = 0;
      let totalPoints = 0;
      let studentCount = 0;
      
      students.forEach(student => {
        if (!student.stats) return;
        
        const statsKey = period === 'daily' ? 'daily' : period === 'weekly' ? 'weekly' : 'monthly';
        const periodStats = student.stats[statsKey];
        
        if (periodStats && periodStats[currentKey]) {
          totalAnswerCount += periodStats[currentKey].answerCount || 0;
          totalPoints += periodStats[currentKey].totalPoints || 0;
          studentCount += 1;
        }
      });
      
      const averageAnswerCount = studentCount > 0 ? (totalAnswerCount / studentCount).toFixed(2) : 0;
      const averagePoints = studentCount > 0 ? (totalPoints / studentCount).toFixed(2) : 0;
      
      res.json({
        period,
        periodKey: currentKey,
        totalAnswerCount,
        totalPoints,
        averageAnswerCount: parseFloat(averageAnswerCount),
        averagePoints: parseFloat(averagePoints),
        activeStudents: studentCount
      });
    } catch (error) {
      console.error('Error getting statistics:', error);
      res.status(500).json({ error: 'Failed to get statistics' });
    }
  });
}

module.exports = { registerStatisticsRoutes };
