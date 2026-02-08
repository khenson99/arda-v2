import { eq, and } from 'drizzle-orm';
import { db, schema } from '@arda/db';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '@arda/auth-utils';
import { AppError } from '../middleware/error-handler.js';
import crypto from 'crypto';

const { users, tenants, refreshTokens, oauthAccounts } = schema;

// ─── Types ────────────────────────────────────────────────────────────
interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
  companySlug?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AuthResponse {
  tokens: TokenPair;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId: string;
    tenantName: string;
  };
}

// ─── Register (Creates Tenant + Admin User) ──────────────────────────
export async function register(input: RegisterInput): Promise<AuthResponse> {
  // Check if email already exists across any tenant
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });
  if (existingUser) {
    throw new AppError(409, 'An account with this email already exists', 'EMAIL_EXISTS');
  }

  // Generate slug from company name if not provided
  const slug = input.companySlug || slugify(input.companyName);

  // Check if slug is taken
  const existingTenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
  });
  if (existingTenant) {
    throw new AppError(409, 'This company URL is already taken', 'SLUG_EXISTS');
  }

  // Create tenant + user in a transaction
  const result = await db.transaction(async (tx) => {
    // Create tenant
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: input.companyName,
        slug,
        planId: 'free',
        cardLimit: 50,
        seatLimit: 3,
      })
      .returning();

    // Create admin user
    const passwordHash = await hashPassword(input.password);
    const [user] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: 'tenant_admin',
        emailVerified: false,
      })
      .returning();

    return { tenant, user };
  });

  // Generate tokens
  const tokens = await createTokenPair(result.user.id, result.tenant.id, result.user.email, result.user.role);

  return {
    tokens,
    user: {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      role: result.user.role,
      tenantId: result.tenant.id,
      tenantName: result.tenant.name,
    },
  };
}

// ─── Login ────────────────────────────────────────────────────────────
export async function login(input: LoginInput): Promise<AuthResponse> {
  // Find user by email (with tenant data)
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
    with: { tenant: true },
  });

  if (!user || !user.passwordHash) {
    throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new AppError(403, 'Account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  const tokens = await createTokenPair(user.id, user.tenantId, user.email, user.role);

  return {
    tokens,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
    },
  };
}

// ─── Refresh Token ────────────────────────────────────────────────────
export async function refreshAccessToken(token: string): Promise<TokenPair> {
  // Verify the refresh token JWT
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // Find the token record in the database
  const tokenHash = hashToken(token);
  const tokenRecord = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      eq(refreshTokens.userId, payload.sub)
    ),
  });

  if (!tokenRecord) {
    throw new AppError(401, 'Refresh token not found', 'REFRESH_TOKEN_NOT_FOUND');
  }

  // Check if revoked (token rotation detection)
  if (tokenRecord.revokedAt) {
    // Possible token theft — revoke all tokens for this user
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.userId, payload.sub));
    throw new AppError(401, 'Refresh token has been revoked', 'REFRESH_TOKEN_REVOKED');
  }

  // Check expiration
  if (new Date() > tokenRecord.expiresAt) {
    throw new AppError(401, 'Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
  }

  // Get user for new access token
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub),
    with: { tenant: true },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or deactivated', 'USER_INVALID');
  }

  // Rotate: revoke old token, create new one
  const newTokens = await db.transaction(async (tx) => {
    // Revoke the old refresh token
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, tokenRecord.id));

    // Create new token pair
    return createTokenPair(
      user.id,
      user.tenantId,
      user.email,
      user.role,
      tx as unknown as typeof db
    );
  });

  return newTokens;
}

// ─── Google OAuth Callback ────────────────────────────────────────────
export async function handleGoogleOAuth(profile: {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}): Promise<AuthResponse> {
  // Check if there's an existing OAuth account
  const existingOAuth = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(oauthAccounts.provider, 'google'),
      eq(oauthAccounts.providerAccountId, profile.googleId)
    ),
    with: { user: { with: { tenant: true } } },
  });

  if (existingOAuth) {
    // Existing user — log them in
    const user = existingOAuth.user;
    if (!user.isActive) {
      throw new AppError(403, 'Account is deactivated', 'ACCOUNT_DEACTIVATED');
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const tokens = await createTokenPair(user.id, user.tenantId, user.email, user.role);
    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: user.tenant.name,
      },
    };
  }

  // Check if email exists (link OAuth to existing account)
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, profile.email),
    with: { tenant: true },
  });

  if (existingUser) {
    // Link OAuth to existing account
    await db.insert(oauthAccounts).values({
      userId: existingUser.id,
      provider: 'google',
      providerAccountId: profile.googleId,
    });

    const tokens = await createTokenPair(
      existingUser.id,
      existingUser.tenantId,
      existingUser.email,
      existingUser.role
    );
    return {
      tokens,
      user: {
        id: existingUser.id,
        email: existingUser.email,
        firstName: existingUser.firstName,
        lastName: existingUser.lastName,
        role: existingUser.role,
        tenantId: existingUser.tenantId,
        tenantName: existingUser.tenant.name,
      },
    };
  }

  // Brand new user — create tenant + user + OAuth link
  const slug = slugify(profile.email.split('@')[0] + '-co');
  const result = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: `${profile.firstName}'s Company`,
        slug,
        planId: 'free',
        cardLimit: 50,
        seatLimit: 3,
      })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatarUrl: profile.avatarUrl,
        role: 'tenant_admin',
        emailVerified: true, // Google-verified
      })
      .returning();

    await tx.insert(oauthAccounts).values({
      userId: user.id,
      provider: 'google',
      providerAccountId: profile.googleId,
    });

    return { tenant, user };
  });

  const tokens = await createTokenPair(
    result.user.id,
    result.tenant.id,
    result.user.email,
    result.user.role
  );

  return {
    tokens,
    user: {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      role: result.user.role,
      tenantId: result.tenant.id,
      tenantName: result.tenant.name,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────
async function createTokenPair(
  userId: string,
  tenantId: string,
  email: string,
  role: string,
  dbClient: typeof db = db
): Promise<TokenPair> {
  const tokenId = crypto.randomUUID();

  // Generate tokens
  const accessToken = generateAccessToken({ sub: userId, tenantId, email, role });
  const refreshTokenStr = generateRefreshToken(userId, tokenId);
  const refreshPayload = verifyRefreshToken(refreshTokenStr);
  const expiresAt = refreshPayload.exp
    ? new Date(refreshPayload.exp * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await dbClient.insert(refreshTokens).values({
    id: tokenId,
    userId,
    tokenHash: hashToken(refreshTokenStr),
    expiresAt,
  });

  return { accessToken, refreshToken: refreshTokenStr };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}
