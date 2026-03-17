// @student-scoring/platform barrel exports

// Routes
export { registerAuthRoutes } from './routes/authRoutes';
export { registerStudentsRoutes } from './routes/studentsRoutes';
export { registerOrganizationsRoutes } from './routes/organizationsRoutes';
export { registerOrgCrudRoutes } from './routes/orgCrudRoutes';
export { registerOrgTeachersRoutes } from './routes/orgTeachersRoutes';
export { registerOrgStudentsRoutes } from './routes/orgStudentsRoutes';
export { registerOrgSettingsRoutes } from './routes/orgSettingsRoutes';
export { registerAdminOrganizationsRoutes } from './routes/adminOrganizationsRoutes';
export { registerChessComTeacherRoutes } from './routes/chesscomTeacherRoutes';
export { registerAttendanceRoutes } from './routes/attendanceRoutes';
export { registerMyOwnAppRoutes } from './routes/myOwnAppRoutes';

// Services
export { createAutoRenew } from './services/autoRenew';

// AI
export { openAiEnabled, openAiJson } from './ai/openai';
