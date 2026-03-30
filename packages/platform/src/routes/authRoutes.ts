// Auth routes extracted from server.js.
// Includes /api/auth/register, /api/auth/login, /api/auth/me.
import { Request, Response, NextFunction } from 'express';
import type { AuthRouteDeps } from '@student-scoring/core';

function registerAuthRoutes(app: any, deps: AuthRouteDeps): void {
  const authenticateUser = deps?.authenticateUser;
  const readUsers = deps?.readUsers;
  const writeUsers = deps?.writeUsers;
  const readOrganizations = deps?.readOrganizations;
  const writeOrganizations = deps?.writeOrganizations;
  const hashPassword = deps?.hashPassword;
  const comparePassword = deps?.comparePassword;
  const generateToken = deps?.generateToken;
  const billingAccess = deps?.billingAccess;

  if (!app) throw new Error('registerAuthRoutes: missing app');
  if (typeof authenticateUser !== 'function') throw new Error('registerAuthRoutes: missing authenticateUser');
  if (typeof readUsers !== 'function') throw new Error('registerAuthRoutes: missing readUsers');
  if (typeof writeUsers !== 'function') throw new Error('registerAuthRoutes: missing writeUsers');
  if (typeof readOrganizations !== 'function') throw new Error('registerAuthRoutes: missing readOrganizations');
  if (typeof writeOrganizations !== 'function') throw new Error('registerAuthRoutes: missing writeOrganizations');
  if (typeof hashPassword !== 'function') throw new Error('registerAuthRoutes: missing hashPassword');
  if (typeof comparePassword !== 'function') throw new Error('registerAuthRoutes: missing comparePassword');
  if (typeof generateToken !== 'function') throw new Error('registerAuthRoutes: missing generateToken');

  function authNotConfigured(res: Response) {
    return res.status(503).json({ error: 'Authentication is not configured on this server' });
  }

  // Organization Registration (only organizations can self-register)
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { organizationName, email, phone, password } = req.body;

      // Validation
      if (!organizationName || !email || !phone || !password) {
        return res.status(400).json({ error: 'Organization name, email, phone, and password are required' });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Password validation (minimum 6 characters)
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      // Check if organization email already exists
      const users = await readUsers();
      const existingUser = users.find(u => u.email === email.toLowerCase());
      if (existingUser) {
        return res.status(400).json({ error: 'Organization with this email already exists' });
      }

      // Check if organization name already exists
      const organizations = await readOrganizations();
      const existingOrg = organizations.find(o => o.name === organizationName);
      if (existingOrg) {
        return res.status(400).json({ error: 'Organization with this name already exists' });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create organization
      const organizationId = Date.now().toString();
      const newOrganization = {
        id: organizationId,
        name: organizationName,
        email: email.toLowerCase(),
        phone,
        createdAt: new Date().toISOString(),
        teachers: [],
        students: []
      };

      organizations.push(newOrganization);
      await writeOrganizations(organizations);

      // Create organization user account
      const newUser = {
        id: Date.now().toString(),
        email: email.toLowerCase(),
        password: hashedPassword,
        name: organizationName,
        role: 'organization',
        organizationId: organizationId,
        createdAt: new Date().toISOString()
      };

      users.push(newUser);
      await writeUsers(users);

      // Provision 14-day trial for newly registered organization
      try {
        await billingAccess.ensureTrialForOrg(organizationId, 14);
      } catch (e) {
        // Trial provisioning should not block registration
        console.warn('Trial provisioning failed:', e.message || e);
      }

      // Generate token
      if (!(generateToken as any).isConfigured?.()) {
        return authNotConfigured(res);
      }
      const token = generateToken(newUser);

      // Return user info (without password)
      const { password: _, ...userWithoutPassword } = newUser;
      res.status(201).json({
        user: userWithoutPassword,
        organization: newOrganization,
        token
      });
    } catch (error) {
      console.error('Error registering organization:', error);
      res.status(500).json({ error: 'Failed to register organization' });
    }
  });

  // User Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password, username } = req.body;

      // Validation - support both email and username login
      const loginIdentifier = email || username;
      if (!loginIdentifier || !password) {
        return res.status(400).json({ error: 'Email/username and password are required' });
      }

      // Find user by email or username
      const users = await readUsers();
      console.log(`[LOGIN] Attempting login with: ${loginIdentifier}`);
      console.log(`[LOGIN] Total users: ${users.length}`);

      const user = users.find(u =>
        u.email === loginIdentifier.toLowerCase() ||
        u.username === loginIdentifier
      );

      if (!user) {
        console.log(`[LOGIN] User not found: ${loginIdentifier}`);
        console.log(`[LOGIN] Available emails: ${users.map(u => u.email).join(', ')}`);
        return res.status(401).json({ error: 'Invalid email/username or password' });
      }

      console.log(`[LOGIN] User found: ${user.email} (${user.role})`);

      // Verify password
      const isValidPassword = await comparePassword(password, user.password);
      console.log(`[LOGIN] Password valid: ${isValidPassword}`);

      if (!isValidPassword) {
        console.log(`[LOGIN] Password verification failed for: ${user.email}`);
        return res.status(401).json({ error: 'Invalid email/username or password' });
      }

      // Generate token
      if (!(generateToken as any).isConfigured?.()) {
        return authNotConfigured(res);
      }
      const token = generateToken(user);

      // Return user info (without password)
      const { password: _, ...userWithoutPassword } = user;

      // Include organization info if user is organization or teacher
      if ((user.role === 'organization' || user.role === 'teacher') && user.organizationId) {
        const organizations = await readOrganizations();
        const organization = organizations.find(o => o.id === user.organizationId);
        if (organization) {
          userWithoutPassword.organization = organization;
        }
      }

      res.json({
        user: userWithoutPassword,
        token
      });
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).json({ error: 'Failed to login' });
    }
  });

  // Get current user info (requires authentication)
  app.get('/api/auth/me', authenticateUser, async (req, res) => {
    try {
      const users = await readUsers();
      const user = users.find(u => u.id === req.user.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If organization, include organization details
      if (user.role === 'organization' && user.organizationId) {
        const organizations = await readOrganizations();
        const organization = organizations.find(o => o.id === user.organizationId);
        const { password: _, ...userWithoutPassword } = user;
        return res.json({ ...userWithoutPassword, organization });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error('Error getting user info:', error);
      res.status(500).json({ error: 'Failed to get user info' });
    }
  });
}

module.exports = { registerAuthRoutes };
