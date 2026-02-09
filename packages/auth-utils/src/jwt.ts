import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

const TOKEN_ISSUER = 'arda-v2';
const TOKEN_AUDIENCE = 'arda-v2-api';
const MIN_SECRET_LENGTH = 32;

interface JwtRuntimeConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiry: SignOptions['expiresIn'];
  refreshExpiry: SignOptions['expiresIn'];
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}

function readRequiredSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = readOptionalEnv(name);
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be set to a string with at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return value;
}

function getJwtRuntimeConfig(): JwtRuntimeConfig {
  return {
    accessSecret: readRequiredSecret('JWT_SECRET'),
    refreshSecret: readRequiredSecret('JWT_REFRESH_SECRET'),
    accessExpiry: (readOptionalEnv('JWT_EXPIRY') ?? '15m') as SignOptions['expiresIn'],
    refreshExpiry: (readOptionalEnv('JWT_REFRESH_EXPIRY') ?? '7d') as SignOptions['expiresIn'],
  };
}

// ─── JWT Payload Types ────────────────────────────────────────────────
export interface JwtPayload {
  sub: string;       // user ID
  tenantId: string;  // tenant ID (for RLS context)
  email: string;
  role: string;      // user role
  iat?: number;
  exp?: number;
}

interface RefreshTokenPayload {
  sub: string;
  tokenId: string; // refresh token row ID
  iat?: number;
  exp?: number;
}

// ─── Access Tokens ────────────────────────────────────────────────────
export function generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const runtime = getJwtRuntimeConfig();
  const options: SignOptions = {
    expiresIn: runtime.accessExpiry,
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  };
  return jwt.sign(payload, runtime.accessSecret, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  const runtime = getJwtRuntimeConfig();
  return jwt.verify(token, runtime.accessSecret, {
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  }) as JwtPayload;
}

// ─── Refresh Tokens ───────────────────────────────────────────────────
export function generateRefreshToken(userId: string, tokenId: string): string {
  const runtime = getJwtRuntimeConfig();
  const payload: RefreshTokenPayload = {
    sub: userId,
    tokenId,
  };
  const options: SignOptions = {
    expiresIn: runtime.refreshExpiry,
    issuer: TOKEN_ISSUER,
  };
  return jwt.sign(payload, runtime.refreshSecret, options);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const runtime = getJwtRuntimeConfig();
  return jwt.verify(token, runtime.refreshSecret, {
    issuer: TOKEN_ISSUER,
  }) as RefreshTokenPayload;
}
