// Teacher Class View routes extracted from server.js.

function registerTeacherClassViewRoutes(app, deps) {
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const readUsers = deps?.readUsers;
  const writeUsers = deps?.writeUsers;
  const readData = deps?.readData;

  if (!app) throw new Error('registerTeacherClassViewRoutes: missing app');
  if (typeof authenticateUser !== 'function') throw new Error('registerTeacherClassViewRoutes: missing authenticateUser');
  if (typeof authorizeRole !== 'function') throw new Error('registerTeacherClassViewRoutes: missing authorizeRole');
  if (typeof readUsers !== 'function') throw new Error('registerTeacherClassViewRoutes: missing readUsers');
  if (typeof writeUsers !== 'function') throw new Error('registerTeacherClassViewRoutes: missing writeUsers');
  if (typeof readData !== 'function') throw new Error('registerTeacherClassViewRoutes: missing readData');

  // Teacher selects students for Class View
  app.post('/api/teachers/class-view/students', authenticateUser, authorizeRole('teacher'), async (req, res) => {
    try {
      const { studentIds } = req.body;

      if (!Array.isArray(studentIds)) {
        return res.status(400).json({ error: 'studentIds must be an array' });
      }

      // Get teacher
      const users = await readUsers();
      const teacher = users.find(u => u.id === req.user.id);

      if (!teacher || !teacher.organizationId) {
        return res.status(403).json({ error: 'Teacher not found' });
      }

      // Verify all students belong to the same organization
      const data = await readData();
      const students = data.students.filter(s =>
        studentIds.includes(s.id) && s.organizationId === teacher.organizationId
      );

      if (students.length !== studentIds.length) {
        return res.status(400).json({ error: 'Some students not found or do not belong to your organization' });
      }

      // Update teacher's class view students
      teacher.classViewStudents = studentIds;

      const userIndex = users.findIndex(u => u.id === teacher.id);
      users[userIndex] = teacher;
      await writeUsers(users);

      return res.json({
        message: 'Students added to Class View successfully',
        classViewStudents: studentIds,
        students: students
      });
    } catch (error) {
      console.error('Error updating class view students:', error);
      return res.status(500).json({ error: 'Failed to update class view students' });
    }
  });

  // Teacher gets students for Class View
  app.get('/api/teachers/class-view/students', authenticateUser, authorizeRole('teacher'), async (req, res) => {
    try {
      // Get teacher
      const users = await readUsers();
      const teacher = users.find(u => u.id === req.user.id);

      if (!teacher || !teacher.organizationId) {
        return res.status(403).json({ error: 'Teacher not found' });
      }

      // Get all students in the organization
      const data = await readData();
      const allStudents = data.students.filter(s => s.organizationId === teacher.organizationId);

      // Get selected students for Class View
      const selectedStudentIds = teacher.classViewStudents || [];
      const selectedStudents = allStudents.filter(s => selectedStudentIds.includes(s.id));

      return res.json({
        allStudents: allStudents,
        selectedStudents: selectedStudents,
        selectedStudentIds: selectedStudentIds
      });
    } catch (error) {
      console.error('Error getting class view students:', error);
      return res.status(500).json({ error: 'Failed to get class view students' });
    }
  });
}

module.exports = { registerTeacherClassViewRoutes };


