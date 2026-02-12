// ─── Security Audit Events ──────────────────────────────────────────
// Events emitted for security-relevant actions: authentication, authorization
// failures, token operations, and tenant context changes.

// ─── Event Type Definitions ─────────────────────────────────────────

export interface AuthLoginEvent {
  type: 'security.auth.login';
  tenantId: string;
  userId: string;
  email: string;
  method: 'password' | 'google' | 'refresh';
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export interface AuthLoginFailedEvent {
  type: 'security.auth.login_failed';
  tenantId?: string;
  email: string;
  reason: 'invalid_credentials' | 'account_deactivated' | 'invalid_google_token' | 'unknown';
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export interface AuthLogoutEvent {
  type: 'security.auth.logout';
  tenantId: string;
  userId: string;
  timestamp: string;
}

export interface TokenRefreshEvent {
  type: 'security.token.refresh';
  tenantId: string;
  userId: string;
  tokenId: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export interface TokenReplayDetectedEvent {
  type: 'security.token.replay_detected';
  tenantId: string;
  userId: string;
  revokedTokenId: string;
  ipAddress?: string;
  userAgent?: string;
  sessionsRevoked: number;
  timestamp: string;
}

export interface TokenRevokedEvent {
  type: 'security.token.revoked';
  tenantId: string;
  userId: string;
  reason: 'logout' | 'password_change' | 'admin_action' | 'replay_detected';
  tokensRevoked: number;
  timestamp: string;
}

export interface AuthorizationDeniedEvent {
  type: 'security.authorization.denied';
  tenantId: string;
  userId: string;
  role: string;
  requiredPermissions: string[];
  resource: string;
  action: string;
  ipAddress?: string;
  timestamp: string;
}

export interface TenantContextViolationEvent {
  type: 'security.tenant.context_violation';
  expectedTenantId?: string;
  actualTenantId?: string;
  userId?: string;
  resource: string;
  ipAddress?: string;
  timestamp: string;
}

// ─── Automation Security Events ─────────────────────────────────────

export interface AutomationActionBlockedEvent {
  type: 'security.automation.action_blocked';
  tenantId: string;
  actionType: string;
  ruleId?: string;
  idempotencyKey?: string;
  reason: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface AutomationActionApprovedEvent {
  type: 'security.automation.action_approved';
  tenantId: string;
  actionType: string;
  ruleId?: string;
  idempotencyKey?: string;
  wasReplay: boolean;
  durationMs: number;
  timestamp: string;
}

export interface AutomationGuardrailViolationEvent {
  type: 'security.automation.guardrail_violation';
  tenantId: string;
  actionType: string;
  violations: Array<{ guardrailId: string; description: string }>;
  blocked: boolean;
  timestamp: string;
}

export interface AutomationTenantValidationFailedEvent {
  type: 'security.automation.tenant_validation_failed';
  tenantId: string;
  actionType: string;
  ruleId?: string;
  reason: string;
  timestamp: string;
}

// ─── Union Type ─────────────────────────────────────────────────────

export type SecurityEvent =
  | AuthLoginEvent
  | AuthLoginFailedEvent
  | AuthLogoutEvent
  | TokenRefreshEvent
  | TokenReplayDetectedEvent
  | TokenRevokedEvent
  | AuthorizationDeniedEvent
  | TenantContextViolationEvent
  | AutomationActionBlockedEvent
  | AutomationActionApprovedEvent
  | AutomationGuardrailViolationEvent
  | AutomationTenantValidationFailedEvent;

// ─── Security Event Type Constants ──────────────────────────────────

export const SecurityEventType = {
  AUTH_LOGIN: 'security.auth.login',
  AUTH_LOGIN_FAILED: 'security.auth.login_failed',
  AUTH_LOGOUT: 'security.auth.logout',
  TOKEN_REFRESH: 'security.token.refresh',
  TOKEN_REPLAY_DETECTED: 'security.token.replay_detected',
  TOKEN_REVOKED: 'security.token.revoked',
  AUTHORIZATION_DENIED: 'security.authorization.denied',
  TENANT_CONTEXT_VIOLATION: 'security.tenant.context_violation',
  AUTOMATION_ACTION_BLOCKED: 'security.automation.action_blocked',
  AUTOMATION_ACTION_APPROVED: 'security.automation.action_approved',
  AUTOMATION_GUARDRAIL_VIOLATION: 'security.automation.guardrail_violation',
  AUTOMATION_TENANT_VALIDATION_FAILED: 'security.automation.tenant_validation_failed',
} as const;

// ─── Type Guard ─────────────────────────────────────────────────────

export function isSecurityEvent(event: { type: string }): event is SecurityEvent {
  return event.type.startsWith('security.');
}
