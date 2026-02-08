import type { JwtPayload } from '@arda/auth-utils';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};
