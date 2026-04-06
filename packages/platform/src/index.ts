// @student-scoring/platform barrel exports
const authRoutes = require('./routes/authRoutes');
const studentsRoutes = require('./routes/studentsRoutes');
const organizationsRoutes = require('./routes/organizationsRoutes');
const orgCrudRoutes = require('./routes/orgCrudRoutes');
const orgTeachersRoutes = require('./routes/orgTeachersRoutes');
const orgStudentsRoutes = require('./routes/orgStudentsRoutes');
const orgSettingsRoutes = require('./routes/orgSettingsRoutes');
const adminOrganizationsRoutes = require('./routes/adminOrganizationsRoutes');
const chessComTeacherRoutes = require('./routes/chesscomTeacherRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const myOwnAppRoutes = require('./routes/myOwnAppRoutes');
const vchessInvoiceLlmRoutes = require('./routes/vchessInvoiceLlmRoutes');
const autoRenew = require('./services/autoRenew');
const openAi = require('./ai/openai');

// Routes
export const registerAuthRoutes = authRoutes.registerAuthRoutes;
export const registerStudentsRoutes = studentsRoutes.registerStudentsRoutes;
export const registerOrganizationsRoutes = organizationsRoutes.registerOrganizationsRoutes;
export const registerOrgCrudRoutes = orgCrudRoutes.registerOrgCrudRoutes;
export const registerOrgTeachersRoutes = orgTeachersRoutes.registerOrgTeachersRoutes;
export const registerOrgStudentsRoutes = orgStudentsRoutes.registerOrgStudentsRoutes;
export const registerOrgSettingsRoutes = orgSettingsRoutes.registerOrgSettingsRoutes;
export const registerAdminOrganizationsRoutes = adminOrganizationsRoutes.registerAdminOrganizationsRoutes;
export const registerChessComTeacherRoutes = chessComTeacherRoutes.registerChessComTeacherRoutes;
export const registerAttendanceRoutes = attendanceRoutes.registerAttendanceRoutes;
export const registerMyOwnAppRoutes = myOwnAppRoutes.registerMyOwnAppRoutes;
export const registerVchessInvoiceLlmRoutes = vchessInvoiceLlmRoutes.registerVchessInvoiceLlmRoutes;

// Services
export const createAutoRenew = autoRenew.createAutoRenew;

// AI
export const openAiEnabled = openAi.openAiEnabled;
export const openAiJson = openAi.openAiJson;
