import { db, schema } from '@arda/db';
import { eq, and, sql, like } from 'drizzle-orm';

const { purchaseOrders, workOrders, transferOrders } = schema;

/**
 * Generate the next sequential order number for a given tenant and type.
 * Format: PO-YYYYMMDD-XXXX, WO-YYYYMMDD-XXXX, TO-YYYYMMDD-XXXX
 */
async function getNextNumber(
  tenantId: string,
  prefix: 'PO' | 'WO' | 'TO'
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const pattern = `${prefix}-${dateStr}-%`;

  let maxNumber = 0;

  if (prefix === 'PO') {
    const result = await db
      .select({ poNumber: purchaseOrders.poNumber })
      .from(purchaseOrders)
      .where(
        and(eq(purchaseOrders.tenantId, tenantId), like(purchaseOrders.poNumber, pattern))
      )
      .orderBy(sql`${purchaseOrders.poNumber} DESC`)
      .limit(1);

    if (result.length > 0) {
      const last = result[0].poNumber.split('-').pop();
      maxNumber = parseInt(last || '0', 10);
    }
  } else if (prefix === 'WO') {
    const result = await db
      .select({ woNumber: workOrders.woNumber })
      .from(workOrders)
      .where(
        and(eq(workOrders.tenantId, tenantId), like(workOrders.woNumber, pattern))
      )
      .orderBy(sql`${workOrders.woNumber} DESC`)
      .limit(1);

    if (result.length > 0) {
      const last = result[0].woNumber.split('-').pop();
      maxNumber = parseInt(last || '0', 10);
    }
  } else {
    const result = await db
      .select({ toNumber: transferOrders.toNumber })
      .from(transferOrders)
      .where(
        and(eq(transferOrders.tenantId, tenantId), like(transferOrders.toNumber, pattern))
      )
      .orderBy(sql`${transferOrders.toNumber} DESC`)
      .limit(1);

    if (result.length > 0) {
      const last = result[0].toNumber.split('-').pop();
      maxNumber = parseInt(last || '0', 10);
    }
  }

  const nextSeq = String(maxNumber + 1).padStart(4, '0');
  return `${prefix}-${dateStr}-${nextSeq}`;
}

export async function getNextPONumber(tenantId: string) {
  return getNextNumber(tenantId, 'PO');
}

export async function getNextWONumber(tenantId: string) {
  return getNextNumber(tenantId, 'WO');
}

export async function getNextTONumber(tenantId: string) {
  return getNextNumber(tenantId, 'TO');
}
