const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-random-secret-key-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Compare a plain text password with a hashed password
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - True if passwords match
 */
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token for a user
 * @param {object} user - User object (should contain id, email, role)
 * @returns {string} - JWT token
 */
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    organizationId: user.organizationId || null // Include organizationId if exists
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Generate a JWT token for a user with a custom expiry (e.g. "30d", "7d", "12h")
 * @param {object} user - User object (should contain id, email, role)
 * @param {string} expiresIn - jsonwebtoken expiresIn value
 * @returns {string} - JWT token
 */
function generateTokenWithExpiry(user, expiresIn) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    organizationId: user.organizationId || null
  };
  const exp = String(expiresIn || '').trim() || JWT_EXPIRES_IN;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: exp });
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token
 * @returns {object|null} - Decoded token payload or null if invalid
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Extract token from Authorization header
 * @param {object} req - Express request object
 * @returns {string|null} - Token or null
 */
function extractTokenFromHeader(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  generateTokenWithExpiry,
  verifyToken,
  extractTokenFromHeader
};

