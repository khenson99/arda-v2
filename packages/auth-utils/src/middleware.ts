import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type JwtPayload } from './jwt.js';

// ─── Augmented Request Type ───────────────────────────────────────────
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// ─── Auth Middleware (Verify JWT) ─────────────────────────────────────
export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Role Guard Middleware ────────────────────────────────────────────
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    // tenant_admin can do everything
    if (req.user.role === 'tenant_admin' || allowedRoles.includes(req.user.role)) {
      next();
      return;
    }
    res.status(403).json({
      error: 'Insufficient permissions',
      required: allowedRoles,
      current: req.user.role,
    });
  };
}
