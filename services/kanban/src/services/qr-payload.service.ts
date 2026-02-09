// ─── QR Payload Service ──────────────────────────────────────────────
// Manages QR code payload generation, batch operations, and scan resolution.
// Enforces the UUID immutability contract: card.id IS the QR identifier.

import { eq, and, inArray } from 'drizzle-orm';
import { db, schema } from '@arda/db';
import { buildScanUrl, generateQRDataUrl } from '../utils/qr-generator.js';

const { kanbanCards } = schema;

// ─── Types ───────────────────────────────────────────────────────────

export interface QrPayload {
  cardId: string;
  scanUrl: string;
  qrCodeDataUrl: string;
}

export interface QrPayloadBatchItem {
  cardId: string;
  payload?: QrPayload;
  error?: string;
}

export type QrResolutionStatus =
  | 'VALID'
  | 'CARD_NOT_FOUND'
  | 'CARD_INACTIVE'
  | 'MALFORMED_UUID';

export interface QrResolutionResult {
  status: QrResolutionStatus;
  card?: typeof kanbanCards.$inferSelect;
  message: string;
}

// ─── Single Card QR Payload ──────────────────────────────────────────
export async function generateQrPayload(
  cardId: string,
  tenantSlug?: string,
): Promise<QrPayload> {
  // UUID immutability: we use card.id directly as the QR identifier.
  // No separate qr_id field exists — this IS the design contract.
  const scanUrl = buildScanUrl(cardId, tenantSlug);
  const qrCodeDataUrl = await generateQRDataUrl(cardId, tenantSlug);

  return { cardId, scanUrl, qrCodeDataUrl };
}

// ─── Batch QR Payload Generation ────────────────────────────────────
const MAX_BATCH_SIZE = 200;

export async function generateQrPayloadBatch(
  cardIds: string[],
  tenantSlug?: string,
): Promise<QrPayloadBatchItem[]> {
  if (cardIds.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE}`);
  }

  // Deduplicate
  const uniqueIds = [...new Set(cardIds)];

  const results: QrPayloadBatchItem[] = [];

  for (const cardId of uniqueIds) {
    try {
      const payload = await generateQrPayload(cardId, tenantSlug);
      results.push({ cardId, payload });
    } catch (err) {
      results.push({
        cardId,
        error: err instanceof Error ? err.message : 'Unknown error generating QR payload',
      });
    }
  }

  return results;
}

// ─── Resolve a QR Scan (Public) ─────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveQrScan(cardId: string): Promise<QrResolutionResult> {
  if (!UUID_RE.test(cardId)) {
    return { status: 'MALFORMED_UUID', message: 'Invalid QR code: malformed UUID.' };
  }

  const card = await db.query.kanbanCards.findFirst({
    where: eq(kanbanCards.id, cardId),
  });

  if (!card) {
    return { status: 'CARD_NOT_FOUND', message: 'Card not found. This QR code may be invalid.' };
  }

  if (!card.isActive) {
    return { status: 'CARD_INACTIVE', card, message: 'This card has been deactivated.' };
  }

  return { status: 'VALID', card, message: 'Card found.' };
}

// ─── Verify UUID Immutability (Reprint Safety Check) ─────────────────
export async function verifyCardUuidImmutability(
  cardId: string,
  tenantId: string,
): Promise<{ immutable: boolean; card?: typeof kanbanCards.$inferSelect }> {
  const card = await db.query.kanbanCards.findFirst({
    where: and(eq(kanbanCards.id, cardId), eq(kanbanCards.tenantId, tenantId)),
  });

  if (!card) {
    return { immutable: false };
  }

  // The card's id (primary key) is the UUID on the QR code.
  // If we found it by id, the UUID is still immutable.
  return { immutable: true, card };
}

// ─── Build Deep Link URL ────────────────────────────────────────────
export function buildDeepLinkUrl(cardId: string, tenantSlug?: string): string {
  return buildScanUrl(cardId, tenantSlug);
}
