/**
 * URL Handoff Adapter
 *
 * Generates signed URLs for external handoff actions (e.g. supplier
 * portals, approval workflows). Uses HMAC-SHA256 signatures with
 * configurable expiration to prevent tampering and replay.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { createLogger } from '@arda/config';
import type {
  ActionAdapter,
  ActionAdapterResult,
  URLHandoffContext,
  URLHandoffResult,
} from '../types.js';

const log = createLogger('automation:adapter:url-handoff');

// ─── Signing Helpers ────────────────────────────────────────────────

const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface URLSignerOptions {
  /** HMAC secret key — must be provided in production. */
  secret: string;
  /** Default expiry in seconds. Defaults to 7 days. */
  defaultExpirySec?: number;
}

/**
 * Generate an HMAC-SHA256 signature for URL parameters.
 */
function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Build a signed URL with embedded token, expiry, and all context params.
 */
export function buildSignedUrl(
  context: URLHandoffContext,
  secret: string,
  defaultExpirySec: number = DEFAULT_EXPIRY_SECONDS,
): URLHandoffResult {
  const expirySec = context.expiresInSeconds ?? defaultExpirySec;
  const expiresAt = new Date(Date.now() + expirySec * 1000).toISOString();
  const token = randomBytes(16).toString('hex');

  // Build the parameter string for signing
  const signPayload = [
    `tenant=${context.tenantId}`,
    `entity=${context.entityType}:${context.entityId}`,
    `action=${context.action}`,
    `token=${token}`,
    `expires=${expiresAt}`,
  ].join('&');

  const signature = sign(signPayload, secret);

  // Build the final URL
  const url = new URL(context.targetUrl);
  url.searchParams.set('tenant', context.tenantId);
  url.searchParams.set('entity_type', context.entityType);
  url.searchParams.set('entity_id', context.entityId);
  url.searchParams.set('action', context.action);
  url.searchParams.set('token', token);
  url.searchParams.set('expires', expiresAt);
  url.searchParams.set('sig', signature);

  // Append any additional params
  if (context.params) {
    for (const [key, value] of Object.entries(context.params)) {
      url.searchParams.set(key, value);
    }
  }

  return {
    signedUrl: url.toString(),
    expiresAt,
    token,
  };
}

/**
 * Verify a signed URL's signature and expiry.
 */
export function verifySignedUrl(
  signedUrl: string,
  secret: string,
): { valid: boolean; expired: boolean; reason?: string } {
  try {
    const url = new URL(signedUrl);
    const tenant = url.searchParams.get('tenant');
    const entityType = url.searchParams.get('entity_type');
    const entityId = url.searchParams.get('entity_id');
    const action = url.searchParams.get('action');
    const token = url.searchParams.get('token');
    const expiresAt = url.searchParams.get('expires');
    const sig = url.searchParams.get('sig');

    if (!tenant || !entityType || !entityId || !action || !token || !expiresAt || !sig) {
      return { valid: false, expired: false, reason: 'Missing required parameters' };
    }

    // Check expiry
    const expired = new Date(expiresAt) < new Date();

    // Rebuild signature
    const signPayload = [
      `tenant=${tenant}`,
      `entity=${entityType}:${entityId}`,
      `action=${action}`,
      `token=${token}`,
      `expires=${expiresAt}`,
    ].join('&');

    const expectedSig = sign(signPayload, secret);
    const valid = sig === expectedSig;

    if (!valid) {
      return { valid: false, expired, reason: 'Invalid signature' };
    }
    if (expired) {
      return { valid: false, expired: true, reason: 'URL has expired' };
    }

    return { valid: true, expired: false };
  } catch {
    return { valid: false, expired: false, reason: 'Malformed URL' };
  }
}

// ─── URL Handoff Adapter ────────────────────────────────────────────

export class URLHandoffAdapter
  implements ActionAdapter<URLHandoffContext, URLHandoffResult>
{
  readonly name = 'url_handoff';
  private readonly secret: string;
  private readonly defaultExpirySec: number;

  constructor(options: URLSignerOptions) {
    this.secret = options.secret;
    this.defaultExpirySec = options.defaultExpirySec ?? DEFAULT_EXPIRY_SECONDS;
  }

  async execute(
    context: URLHandoffContext,
  ): Promise<ActionAdapterResult<URLHandoffResult>> {
    try {
      if (!context.targetUrl) {
        return {
          success: false,
          error: 'Target URL is required',
          retryable: false,
        };
      }

      // Validate the target URL is well-formed
      try {
        new URL(context.targetUrl);
      } catch {
        return {
          success: false,
          error: `Invalid target URL: ${context.targetUrl}`,
          retryable: false,
        };
      }

      const result = buildSignedUrl(context, this.secret, this.defaultExpirySec);

      log.info(
        {
          tenantId: context.tenantId,
          entityType: context.entityType,
          entityId: context.entityId,
          expiresAt: result.expiresAt,
        },
        'URL handoff generated',
      );

      return {
        success: true,
        data: result,
        retryable: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err, context }, 'URL handoff adapter failed');
      return {
        success: false,
        error: message,
        retryable: false,
      };
    }
  }
}
