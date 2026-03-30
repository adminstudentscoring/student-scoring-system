// @student-scoring/class-view barrel exports
const challengeRoutes = require('./routes/challengeRoutes');
const teacherClassViewRoutes = require('./routes/teacherClassViewRoutes');
const statisticsRoutes = require('./routes/statisticsRoutes');

export const registerChallengeRoutes = challengeRoutes.registerChallengeRoutes;
export const registerTeacherClassViewRoutes = teacherClassViewRoutes.registerTeacherClassViewRoutes;
export const registerStatisticsRoutes = statisticsRoutes.registerStatisticsRoutes;
