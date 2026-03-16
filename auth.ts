import type { Request } from 'express';
import type { JwtPayload } from 'jsonwebtoken';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET: string = process.env.JWT_SECRET || 'change-this-to-a-random-secret-key-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

interface TokenUser {
  id: string;
  email: string;
  role: string;
  name?: string;
  organizationId?: string | null;
}

interface TokenPayload extends JwtPayload {
  id: string;
  email: string;
  role: string;
  name?: string;
  organizationId?: string | null;
}

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

function generateToken(user: TokenUser): string {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    organizationId: user.organizationId || null
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function generateTokenWithExpiry(user: TokenUser, expiresIn: string): string {
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

function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    return null;
  }
}

function extractTokenFromHeader(req: Request): string | null {
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
