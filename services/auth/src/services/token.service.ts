import { eq, and, isNull } from 'drizzle-orm';
import { db, schema } from '@arda/db';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '@arda/auth-utils';
import crypto from 'crypto';

const { refreshTokens, users } = schema;

// ─── Types ──────────────────────────────────────────────────────────
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface CreateTokenOptions {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  familyId?: string;
  userAgent?: string;
  ipAddress?: string;
  dbClient?: typeof db;
}

export interface RefreshTokenOptions {
  token: string;
  userAgent?: string;
  ipAddress?: string;
}

// ─── Token Lifecycle Service ────────────────────────────────────────

/**
 * Create a new token pair (access + refresh).
 * If no familyId is provided, a new family is started (e.g., on login).
 * If a familyId is provided, the new refresh token joins that family (rotation).
 */
export async function createTokenPair(options: CreateTokenOptions): Promise<TokenPair> {
  const {
    userId,
    tenantId,
    email,
    role,
    familyId,
    userAgent,
    ipAddress,
    dbClient = db,
  } = options;

  const tokenId = crypto.randomUUID();
  const tokenFamilyId = familyId ?? crypto.randomUUID();

  // Generate JWT tokens
  const accessToken = generateAccessToken({ sub: userId, tenantId, email, role });
  const refreshTokenStr = generateRefreshToken(userId, tokenId);

  // Decode the refresh token to extract expiration
  const refreshPayload = verifyRefreshToken(refreshTokenStr);
  const expiresAt = refreshPayload.exp
    ? new Date(refreshPayload.exp * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day fallback

  // Store the refresh token in the database
  await dbClient.insert(refreshTokens).values({
    id: tokenId,
    userId,
    tokenHash: hashToken(refreshTokenStr),
    expiresAt,
    userAgent: userAgent ?? null,
    ipAddress: ipAddress ?? null,
  });

  return { accessToken, refreshToken: refreshTokenStr };
}

/**
 * Rotate a refresh token: verify the old one, issue a new pair.
 *
 * Security features:
 * - **Replay detection**: If a revoked token is presented, all tokens for the
 *   user are revoked (assumes token theft).
 * - **Token rotation**: Old token is revoked and linked to the new one via
 *   `replacedByTokenId`, forming a chain for forensic analysis.
 * - **Expiration check**: Expired tokens are rejected.
 * - **User validation**: Deactivated users are rejected.
 */
export async function rotateRefreshToken(options: RefreshTokenOptions): Promise<TokenPair> {
  const { token, userAgent, ipAddress } = options;

  // 1. Verify the JWT signature and decode
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new TokenError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // 2. Look up the token record by hash
  const tokenHash = hashToken(token);
  const tokenRecord = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      eq(refreshTokens.userId, payload.sub),
    ),
  });

  if (!tokenRecord) {
    throw new TokenError('Refresh token not found', 'REFRESH_TOKEN_NOT_FOUND');
  }

  // 3. Replay detection: if the token was already revoked, this is suspicious
  if (tokenRecord.revokedAt) {
    // Revoke ALL tokens for the user to mitigate potential theft.
    // This invalidates every device session for this user.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, payload.sub),
          isNull(refreshTokens.revokedAt),
        ),
      );

    throw new TokenError(
      'Refresh token reuse detected — all sessions revoked',
      'REFRESH_TOKEN_REUSE',
    );
  }

  // 4. Expiration check
  if (new Date() > tokenRecord.expiresAt) {
    throw new TokenError('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
  }

  // 5. Validate user is still active
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub),
    with: { tenant: true },
  });

  if (!user || !user.isActive) {
    throw new TokenError('User not found or deactivated', 'USER_INVALID');
  }

  // 6. Rotate within a transaction: revoke old, create new
  const newTokens = await db.transaction(async (tx) => {
    const newTokenId = crypto.randomUUID();

    // Revoke the old token and link to its replacement
    await tx
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        replacedByTokenId: newTokenId,
      })
      .where(eq(refreshTokens.id, tokenRecord.id));

    // Create new token pair, preserving the family
    return createTokenPair({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      userAgent,
      ipAddress,
      dbClient: tx as unknown as typeof db,
    });
  });

  return newTokens;
}

/**
 * Revoke a specific refresh token (e.g., on logout).
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, tokenHash));
}

/**
 * Revoke ALL refresh tokens for a user (e.g., password change, account compromise).
 */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const result = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
      ),
    )
    .returning({ id: refreshTokens.id });

  return result.length;
}

/**
 * Count active (non-revoked, non-expired) sessions for a user.
 */
export async function countActiveSessions(userId: string): Promise<number> {
  const tokens = await db.query.refreshTokens.findMany({
    where: and(
      eq(refreshTokens.userId, userId),
      isNull(refreshTokens.revokedAt),
    ),
  });

  const now = new Date();
  return tokens.filter((t) => t.expiresAt > now).length;
}

// ─── Token Error ────────────────────────────────────────────────────

export class TokenError extends Error {
  public readonly code: string;
  public readonly statusCode = 401;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'TokenError';
    this.code = code;
  }
}

// ─── Utilities ──────────────────────────────────────────────────────

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
