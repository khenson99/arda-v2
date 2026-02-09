import { describe, it, expect } from 'vitest';
import {
  SecurityEventType,
  isSecurityEvent,
  type SecurityEvent,
  type AuthLoginEvent,
  type AuthLoginFailedEvent,
  type TokenReplayDetectedEvent,
  type AuthorizationDeniedEvent,
  type TenantContextViolationEvent,
} from './security-events.js';

describe('security-events', () => {
  describe('SecurityEventType constants', () => {
    it('has all expected event types', () => {
      expect(SecurityEventType.AUTH_LOGIN).toBe('security.auth.login');
      expect(SecurityEventType.AUTH_LOGIN_FAILED).toBe('security.auth.login_failed');
      expect(SecurityEventType.AUTH_LOGOUT).toBe('security.auth.logout');
      expect(SecurityEventType.TOKEN_REFRESH).toBe('security.token.refresh');
      expect(SecurityEventType.TOKEN_REPLAY_DETECTED).toBe('security.token.replay_detected');
      expect(SecurityEventType.TOKEN_REVOKED).toBe('security.token.revoked');
      expect(SecurityEventType.AUTHORIZATION_DENIED).toBe('security.authorization.denied');
      expect(SecurityEventType.TENANT_CONTEXT_VIOLATION).toBe('security.tenant.context_violation');
    });

    it('has exactly 8 event types', () => {
      expect(Object.keys(SecurityEventType)).toHaveLength(8);
    });
  });

  describe('isSecurityEvent', () => {
    it('identifies security events', () => {
      const loginEvent: AuthLoginEvent = {
        type: 'security.auth.login',
        tenantId: 'tenant-1',
        userId: 'user-1',
        email: 'test@example.com',
        method: 'password',
        timestamp: new Date().toISOString(),
      };

      expect(isSecurityEvent(loginEvent)).toBe(true);
    });

    it('identifies login failed events', () => {
      const failedEvent: AuthLoginFailedEvent = {
        type: 'security.auth.login_failed',
        email: 'unknown@example.com',
        reason: 'invalid_credentials',
        timestamp: new Date().toISOString(),
      };

      expect(isSecurityEvent(failedEvent)).toBe(true);
    });

    it('identifies token replay events', () => {
      const replayEvent: TokenReplayDetectedEvent = {
        type: 'security.token.replay_detected',
        tenantId: 'tenant-1',
        userId: 'user-1',
        revokedTokenId: 'token-1',
        sessionsRevoked: 3,
        timestamp: new Date().toISOString(),
      };

      expect(isSecurityEvent(replayEvent)).toBe(true);
    });

    it('identifies authorization denied events', () => {
      const deniedEvent: AuthorizationDeniedEvent = {
        type: 'security.authorization.denied',
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'salesperson',
        requiredPermissions: ['kanban:loops:create'],
        resource: '/api/kanban/loops',
        action: 'POST',
        timestamp: new Date().toISOString(),
      };

      expect(isSecurityEvent(deniedEvent)).toBe(true);
    });

    it('identifies tenant context violation events', () => {
      const violationEvent: TenantContextViolationEvent = {
        type: 'security.tenant.context_violation',
        expectedTenantId: 'tenant-1',
        actualTenantId: 'tenant-2',
        userId: 'user-1',
        resource: 'kanban.kanban_loops',
        timestamp: new Date().toISOString(),
      };

      expect(isSecurityEvent(violationEvent)).toBe(true);
    });

    it('rejects non-security events', () => {
      expect(isSecurityEvent({ type: 'card.transition' })).toBe(false);
      expect(isSecurityEvent({ type: 'order.created' })).toBe(false);
      expect(isSecurityEvent({ type: 'notification.created' })).toBe(false);
    });

    it('rejects events with similar but non-matching prefixes', () => {
      expect(isSecurityEvent({ type: 'secure.something' })).toBe(false);
      expect(isSecurityEvent({ type: 'security_event' })).toBe(false);
    });
  });

  describe('event type structure', () => {
    it('all security event types start with security.', () => {
      const types = Object.values(SecurityEventType);
      for (const type of types) {
        expect(type).toMatch(/^security\./);
      }
    });

    it('event types follow the security.category.action pattern', () => {
      const types = Object.values(SecurityEventType);
      for (const type of types) {
        const parts = type.split('.');
        expect(parts.length).toBeGreaterThanOrEqual(3);
        expect(parts[0]).toBe('security');
      }
    });
  });
});
