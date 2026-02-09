import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { config } from '@arda/config';

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
  const options: SignOptions = {
    expiresIn: config.JWT_EXPIRY as SignOptions['expiresIn'],
    issuer: 'arda-v2',
    audience: 'arda-v2-api',
  };
  return jwt.sign(payload, config.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, config.JWT_SECRET, {
    issuer: 'arda-v2',
    audience: 'arda-v2-api',
  }) as JwtPayload;
}

// ─── Refresh Tokens ───────────────────────────────────────────────────
export function generateRefreshToken(userId: string, tokenId: string): string {
  const payload: RefreshTokenPayload = {
    sub: userId,
    tokenId,
  };
  const options: SignOptions = {
    expiresIn: config.JWT_REFRESH_EXPIRY as SignOptions['expiresIn'],
    issuer: 'arda-v2',
  };
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, options);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET, {
    issuer: 'arda-v2',
  }) as RefreshTokenPayload;
}
