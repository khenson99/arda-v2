/**
 * Email Adapter
 *
 * Wraps email dispatch through the normalized ActionAdapter interface.
 * Supports templating via placeholder interpolation, delivery-status
 * capture, and both console (dev) and event-bus (prod) backends.
 */

import { createLogger } from '@arda/config';
import type {
  ActionAdapter,
  ActionAdapterResult,
  EmailDispatchContext,
} from '../types.js';

const log = createLogger('automation:adapter:email');

// ─── Email Template ─────────────────────────────────────────────────

export interface EmailTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

/**
 * Built-in templates keyed by purpose.
 * Values may contain `{{variable}}` placeholders.
 */
const TEMPLATES: Record<string, EmailTemplate> = {
  po_confirmation: {
    subject: 'Purchase Order {{poNumber}} — Confirmation',
    bodyHtml: [
      '<p>Hello,</p>',
      '<p>Purchase order <strong>{{poNumber}}</strong> has been issued for <strong>${{totalAmount}}</strong>.</p>',
      '<p>Please review and confirm at your earliest convenience.</p>',
      '<p>— Arda Automation</p>',
    ].join('\n'),
    bodyText: [
      'Hello,',
      '',
      'Purchase order {{poNumber}} has been issued for ${{totalAmount}}.',
      'Please review and confirm at your earliest convenience.',
      '',
      '— Arda Automation',
    ].join('\n'),
  },
  po_followup: {
    subject: 'Follow-up: Purchase Order {{poNumber}}',
    bodyHtml: [
      '<p>Hello,</p>',
      '<p>This is a follow-up regarding purchase order <strong>{{poNumber}}</strong>.</p>',
      '<p>We have not received a response. Please confirm or provide an update.</p>',
      '<p>— Arda Automation</p>',
    ].join('\n'),
    bodyText: [
      'Hello,',
      '',
      'This is a follow-up regarding purchase order {{poNumber}}.',
      'We have not received a response. Please confirm or provide an update.',
      '',
      '— Arda Automation',
    ].join('\n'),
  },
};

// ─── Template Helpers ───────────────────────────────────────────────

/**
 * Replace `{{key}}` placeholders with context values.
 */
function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

export function renderTemplate(
  templateKey: string,
  vars: Record<string, string | number>,
): EmailTemplate {
  const tpl = TEMPLATES[templateKey];
  if (!tpl) {
    throw new Error(`Unknown email template: ${templateKey}`);
  }
  return {
    subject: interpolate(tpl.subject, vars),
    bodyHtml: interpolate(tpl.bodyHtml, vars),
    bodyText: interpolate(tpl.bodyText, vars),
  };
}

// ─── Delivery Backend Interface ─────────────────────────────────────

export interface EmailDeliveryBackend {
  send(params: {
    to: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    metadata: Record<string, string>;
  }): Promise<EmailDeliveryResult>;
}

export interface EmailDeliveryResult {
  messageId: string;
  status: 'accepted' | 'queued' | 'sent' | 'failed';
}

// ─── Console Backend (dev/test) ─────────────────────────────────────

export class ConsoleEmailBackend implements EmailDeliveryBackend {
  public readonly sentMessages: Array<{
    to: string;
    subject: string;
    metadata: Record<string, string>;
  }> = [];

  async send(params: {
    to: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    metadata: Record<string, string>;
  }): Promise<EmailDeliveryResult> {
    this.sentMessages.push({
      to: params.to,
      subject: params.subject,
      metadata: params.metadata,
    });
    log.info(
      { to: params.to, subject: params.subject },
      '[Console] Email sent',
    );
    return {
      messageId: `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'sent',
    };
  }
}

// ─── Event Bus Backend (prod) ───────────────────────────────────────

export class EventBusEmailBackend implements EmailDeliveryBackend {
  constructor(
    private publishFn: (event: Record<string, unknown>) => Promise<void>,
  ) {}

  async send(params: {
    to: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    metadata: Record<string, string>;
  }): Promise<EmailDeliveryResult> {
    const messageId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await this.publishFn({
      type: 'automation.email_dispatched',
      tenantId: params.metadata.tenantId,
      purchaseOrderId: params.metadata.poId,
      supplierId: params.metadata.supplierId,
      supplierEmail: params.to,
      totalAmount: Number(params.metadata.totalAmount),
      subject: params.subject,
      messageId,
      source: 'automation',
      timestamp: new Date().toISOString(),
    });

    return { messageId, status: 'queued' };
  }
}

// ─── Email Adapter ──────────────────────────────────────────────────

export interface EmailAdapterResult {
  messageId: string;
  deliveryStatus: string;
  templateUsed: string;
}

export class EmailActionAdapter
  implements ActionAdapter<EmailDispatchContext, EmailAdapterResult>
{
  readonly name = 'email_dispatch';

  constructor(
    private backend: EmailDeliveryBackend,
    private templateKey: string = 'po_confirmation',
  ) {}

  async execute(
    context: EmailDispatchContext,
  ): Promise<ActionAdapterResult<EmailAdapterResult>> {
    try {
      const vars: Record<string, string | number> = {
        poId: context.poId,
        poNumber: context.poId,
        supplierId: context.supplierId,
        totalAmount: context.totalAmount,
      };

      const rendered = renderTemplate(this.templateKey, vars);

      const result = await this.backend.send({
        to: context.supplierEmail,
        subject: rendered.subject,
        bodyHtml: rendered.bodyHtml,
        bodyText: rendered.bodyText,
        metadata: {
          tenantId: context.tenantId,
          poId: context.poId,
          supplierId: context.supplierId,
          totalAmount: String(context.totalAmount),
        },
      });

      log.info(
        { messageId: result.messageId, status: result.status, to: context.supplierEmail },
        'Email dispatched via adapter',
      );

      return {
        success: result.status !== 'failed',
        data: {
          messageId: result.messageId,
          deliveryStatus: result.status,
          templateUsed: this.templateKey,
        },
        retryable: result.status === 'failed',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err, context }, 'Email adapter failed');
      return {
        success: false,
        error: message,
        retryable: true,
      };
    }
  }
}
