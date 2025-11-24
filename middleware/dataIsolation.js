/**
 * Data isolation middleware
 * Ensures users can only access data from their organization
 */

/**
 * Middleware factory to filter data by organization
 * Requires readUsers function to be passed in
 */
function createRequireOrganizationAccess(readUsersFn) {
  return async function requireOrganizationAccess(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Admin can access all data
    if (req.user.role === 'admin') {
      req.organizationFilter = null; // No filter for admin
      return next();
    }
    
    // If organizationId is not in token, try to load from database
    let organizationId = req.user.organizationId;
    if (!organizationId && (req.user.role === 'organization' || req.user.role === 'teacher')) {
      try {
        const users = await readUsersFn();
        const user = users.find(u => u.id === req.user.id);
        if (user && user.organizationId) {
          organizationId = user.organizationId;
          req.user.organizationId = organizationId; // Update req.user
        }
      } catch (error) {
        console.error('Error loading user organizationId:', error);
      }
    }
    
    // Organization users can only access their own organization's data
    if (req.user.role === 'organization' && organizationId) {
      req.organizationFilter = organizationId;
      return next();
    }
    
    // Teachers can only access their organization's data
    if (req.user.role === 'teacher' && organizationId) {
      req.organizationFilter = organizationId;
      return next();
    }
    
    // Students can only access their own data (future implementation)
    if (req.user.role === 'student' && organizationId) {
      req.organizationFilter = organizationId;
      req.studentFilter = req.user.id; // Only their own records
      return next();
    }
    
    // If we get here and user is organization or teacher but no organizationId, it's an error
    if ((req.user.role === 'organization' || req.user.role === 'teacher') && !organizationId) {
      return res.status(403).json({ error: 'User organization not found' });
    }
    
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

/**
 * Filter students by organization
 */
function filterStudentsByOrganization(students, organizationId) {
  if (!organizationId) return students; // Admin sees all
  return students.filter(s => s.organizationId === organizationId);
}

/**
 * Filter users by organization
 */
function filterUsersByOrganization(users, organizationId) {
  if (!organizationId) return users; // Admin sees all
  return users.filter(u => 
    u.organizationId === organizationId || 
    (u.role === 'organization' && u.id === organizationId)
  );
}

module.exports = {
  createRequireOrganizationAccess,
  filterStudentsByOrganization,
  filterUsersByOrganization
};

