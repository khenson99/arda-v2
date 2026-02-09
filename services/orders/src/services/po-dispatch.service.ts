/**
 * PO Dispatch Service — Email + PDF
 *
 * Dispatches approved purchase orders to suppliers via email with a
 * PDF attachment. Uses adapter interfaces for both email transport and
 * PDF generation so that different implementations can be injected
 * for development, testing, and production.
 */

// ─── Adapter Interfaces ──────────────────────────────────────────────

export interface EmailMessage {
  to: string;
  cc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<{ messageId: string; success: boolean }>;
}

export interface PdfGenerator {
  generatePurchaseOrderPdf(data: PurchaseOrderPdfData): Promise<Buffer>;
}

// ─── Data Types ──────────────────────────────────────────────────────

export interface PurchaseOrderPdfData {
  poNumber: string;
  orderDate: string;
  expectedDeliveryDate: string;
  supplierName: string;
  supplierContact: string;
  supplierEmail: string;
  supplierAddress: string;
  buyerCompanyName: string;
  buyerAddress: string;
  facilityName: string;
  lines: PdfLineItem[];
  subtotal: string;
  taxAmount: string;
  shippingAmount: string;
  totalAmount: string;
  currency: string;
  notes?: string;
  terms?: string;
}

export interface PdfLineItem {
  lineNumber: number;
  partNumber: string;
  partName: string;
  quantity: number;
  unitCost: string;
  lineTotal: string;
  uom: string;
}

export interface DispatchInput {
  poNumber: string;
  supplierEmail: string;
  supplierName: string;
  pdfData: PurchaseOrderPdfData;
  cc?: string[];
}

export interface DispatchResult {
  success: boolean;
  messageId?: string;
  attempts: number;
  error?: string;
}

// ─── Console Email Adapter (Dev/Test) ────────────────────────────────

export class ConsoleEmailAdapter implements EmailAdapter {
  public sentMessages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sentMessages.push(message);
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // In development, log instead of sending
    console.log(`[ConsoleEmailAdapter] Would send to ${message.to}: ${message.subject}`);
    return { messageId, success: true };
  }
}

// ─── Simple PDF Generator (Structured JSON -> Buffer) ────────────────

export class SimplePdfGenerator implements PdfGenerator {
  /**
   * Produces a UTF-8 buffer with structured PO content.
   * In production, swap with a real PDF library (e.g., PDFKit, Puppeteer).
   */
  async generatePurchaseOrderPdf(data: PurchaseOrderPdfData): Promise<Buffer> {
    const content = buildPdfContent(data);
    return Buffer.from(content, 'utf-8');
  }
}

/**
 * Build structured text content for a PO PDF.
 * This is the template that a real PDF renderer would consume.
 */
export function buildPdfContent(data: PurchaseOrderPdfData): string {
  const header = [
    `PURCHASE ORDER: ${data.poNumber}`,
    `Date: ${data.orderDate}`,
    `Expected Delivery: ${data.expectedDeliveryDate}`,
    '',
    `FROM: ${data.buyerCompanyName}`,
    `      ${data.buyerAddress}`,
    `      Ship To: ${data.facilityName}`,
    '',
    `TO:   ${data.supplierName}`,
    `      ${data.supplierAddress}`,
    `      Contact: ${data.supplierContact}`,
    `      Email: ${data.supplierEmail}`,
    '',
    '─'.repeat(70),
    '',
  ].join('\n');

  const lineHeader = [
    padRight('#', 4),
    padRight('Part Number', 16),
    padRight('Description', 24),
    padRight('Qty', 8),
    padRight('UOM', 6),
    padRight('Unit Cost', 12),
    padRight('Total', 12),
  ].join('');

  const lineRows = data.lines.map((line) =>
    [
      padRight(String(line.lineNumber), 4),
      padRight(line.partNumber, 16),
      padRight(line.partName.slice(0, 22), 24),
      padRight(String(line.quantity), 8),
      padRight(line.uom, 6),
      padRight(`${data.currency} ${line.unitCost}`, 12),
      padRight(`${data.currency} ${line.lineTotal}`, 12),
    ].join('')
  );

  const totals = [
    '',
    '─'.repeat(70),
    `${padRight('Subtotal:', 58)}${data.currency} ${data.subtotal}`,
    `${padRight('Tax:', 58)}${data.currency} ${data.taxAmount}`,
    `${padRight('Shipping:', 58)}${data.currency} ${data.shippingAmount}`,
    '─'.repeat(70),
    `${padRight('TOTAL:', 58)}${data.currency} ${data.totalAmount}`,
  ].join('\n');

  const footer = [
    '',
    data.notes ? `Notes: ${data.notes}` : '',
    data.terms ? `Terms: ${data.terms}` : '',
    '',
    'Please confirm receipt of this purchase order by replying to this email.',
  ]
    .filter(Boolean)
    .join('\n');

  return [header, lineHeader, '─'.repeat(70), ...lineRows, totals, footer].join('\n');
}

function padRight(str: string, len: number): string {
  return str.padEnd(len);
}

// ─── Dispatch Orchestrator ───────────────────────────────────────────

export interface DispatchServiceOptions {
  emailAdapter: EmailAdapter;
  pdfGenerator: PdfGenerator;
  maxRetries?: number;
  retryDelayMs?: number;
  fromName?: string;
  fromEmail?: string;
}

export class PODispatchService {
  private emailAdapter: EmailAdapter;
  private pdfGenerator: PdfGenerator;
  private maxRetries: number;
  private retryDelayMs: number;
  private fromName: string;
  private fromEmail: string;

  constructor(options: DispatchServiceOptions) {
    this.emailAdapter = options.emailAdapter;
    this.pdfGenerator = options.pdfGenerator;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.fromName = options.fromName ?? 'Arda Procurement';
    this.fromEmail = options.fromEmail ?? 'procurement@arda.app';
  }

  /**
   * Dispatch a purchase order to the supplier via email with PDF attachment.
   */
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    // 1. Generate PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await this.pdfGenerator.generatePurchaseOrderPdf(input.pdfData);
    } catch (err) {
      return {
        success: false,
        attempts: 0,
        error: `PDF generation failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 2. Build email message
    const message: EmailMessage = {
      to: input.supplierEmail,
      cc: input.cc,
      subject: `Purchase Order ${input.poNumber} from ${this.fromName}`,
      bodyHtml: this.buildEmailHtml(input),
      bodyText: this.buildEmailText(input),
      attachments: [
        {
          filename: `${input.poNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    // 3. Send with retries
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.emailAdapter.send(message);
        if (result.success) {
          return {
            success: true,
            messageId: result.messageId,
            attempts: attempt,
          };
        }
        lastError = 'Email adapter returned success=false';
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      // Wait before retrying (exponential backoff)
      if (attempt < this.maxRetries) {
        await this.delay(this.retryDelayMs * Math.pow(2, attempt - 1));
      }
    }

    return {
      success: false,
      attempts: this.maxRetries,
      error: `Failed after ${this.maxRetries} attempts: ${lastError}`,
    };
  }

  private buildEmailHtml(input: DispatchInput): string {
    return [
      `<p>Dear ${input.supplierName},</p>`,
      `<p>Please find attached Purchase Order <strong>${input.poNumber}</strong>.</p>`,
      `<p>Please review and confirm receipt at your earliest convenience.</p>`,
      `<p>Best regards,<br/>${this.fromName}<br/>${this.fromEmail}</p>`,
    ].join('\n');
  }

  private buildEmailText(input: DispatchInput): string {
    return [
      `Dear ${input.supplierName},`,
      '',
      `Please find attached Purchase Order ${input.poNumber}.`,
      '',
      'Please review and confirm receipt at your earliest convenience.',
      '',
      `Best regards,`,
      this.fromName,
      this.fromEmail,
    ].join('\n');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
