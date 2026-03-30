import type { Request } from 'express';
import type { JwtPayload } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const AUTH_NOT_CONFIGURED_MESSAGE = 'JWT authentication is not configured on this server';
const JWT_SECRET_RAW = String(process.env.JWT_SECRET || '').trim();
const JWT_CONFIGURED = !!JWT_SECRET_RAW;
const JWT_SECRET: string = JWT_CONFIGURED
  ? JWT_SECRET_RAW
  : 'change-this-to-a-random-secret-key-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_CONFIGURED) {
  console.warn(
    `[auth] JWT_SECRET is not configured${process.env.NODE_ENV === 'production' ? ' in production' : ''}. ` +
      'The app will boot, but login and token-protected routes will be unavailable until JWT_SECRET is set.'
  );
}

function createAuthNotConfiguredError(): Error & { code: string } {
  const error = new Error(AUTH_NOT_CONFIGURED_MESSAGE) as Error & { code: string };
  error.code = 'AUTH_NOT_CONFIGURED';
  return error;
}

function ensureJwtConfigured(): void {
  if (!JWT_CONFIGURED) {
    throw createAuthNotConfiguredError();
  }
}

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
  ensureJwtConfigured();
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    organizationId: user.organizationId || null
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

function generateTokenWithExpiry(user: TokenUser, expiresIn: string): string {
  ensureJwtConfigured();
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    organizationId: user.organizationId || null
  };
  const exp = String(expiresIn || '').trim() || JWT_EXPIRES_IN;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: exp as any });
}

function verifyToken(token: string): TokenPayload | null {
  if (!JWT_CONFIGURED) return null;
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

function isAuthConfigured(): boolean {
  return JWT_CONFIGURED;
}

(generateToken as any).isConfigured = isAuthConfigured;
(generateTokenWithExpiry as any).isConfigured = isAuthConfigured;

export {
  AUTH_NOT_CONFIGURED_MESSAGE,
  JWT_CONFIGURED,
  isAuthConfigured,
  hashPassword,
  comparePassword,
  generateToken,
  generateTokenWithExpiry,
  verifyToken,
  extractTokenFromHeader
};
