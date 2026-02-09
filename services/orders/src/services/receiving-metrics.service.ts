import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { db, schema } from '@arda/db';

const { receipts, receiptLines, receivingExceptions } = schema;

// ─── Types ──────────────────────────────────────────────────────────

export interface ReceivingMetricsQuery {
  tenantId: string;
  dateFrom?: string; // ISO date
  dateTo?: string;   // ISO date
}

export interface ReceivingMetrics {
  overview: {
    totalReceipts: number;
    totalLinesProcessed: number;
    totalUnitsAccepted: number;
    totalUnitsDamaged: number;
    totalUnitsRejected: number;
    acceptanceRate: number; // percentage
  };
  exceptions: {
    totalExceptions: number;
    openExceptions: number;
    resolvedExceptions: number;
    avgResolutionTimeHours: number | null;
    byType: Array<{ exceptionType: string; count: number }>;
    bySeverity: Array<{ severity: string; count: number }>;
    byResolution: Array<{ resolutionType: string; count: number }>;
  };
  throughput: {
    receiptsByStatus: Array<{ status: string; count: number }>;
    receiptsByOrderType: Array<{ orderType: string; count: number }>;
  };
}

// ─── Build Date Conditions ──────────────────────────────────────────

function buildDateConditions(
  table: typeof receipts,
  query: ReceivingMetricsQuery
) {
  const conditions = [eq(table.tenantId, query.tenantId)];

  if (query.dateFrom) {
    conditions.push(gte(table.createdAt, new Date(query.dateFrom)));
  }
  if (query.dateTo) {
    conditions.push(lte(table.createdAt, new Date(query.dateTo)));
  }

  return conditions;
}

// ─── Main Metrics Function ──────────────────────────────────────────

export async function getReceivingMetrics(
  query: ReceivingMetricsQuery
): Promise<ReceivingMetrics> {
  const dateConditions = buildDateConditions(receipts, query);

  // ── Overview metrics ──
  const [receiptCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(receipts)
    .where(and(...dateConditions));

  const totalReceipts = receiptCount?.count ?? 0;

  // Line-level aggregates
  let totalLines = 0;
  let totalAccepted = 0;
  let totalDamaged = 0;
  let totalRejected = 0;

  if (query.dateFrom || query.dateTo) {
    // Join with receipts for date filtering
    const [lineAgg] = await db
      .select({
        totalLines: sql<number>`count(*)`,
        totalAccepted: sql<number>`coalesce(sum(${receiptLines.quantityAccepted}), 0)`,
        totalDamaged: sql<number>`coalesce(sum(${receiptLines.quantityDamaged}), 0)`,
        totalRejected: sql<number>`coalesce(sum(${receiptLines.quantityRejected}), 0)`,
      })
      .from(receiptLines)
      .innerJoin(receipts, eq(receiptLines.receiptId, receipts.id))
      .where(and(...dateConditions));

    totalLines = lineAgg?.totalLines ?? 0;
    totalAccepted = lineAgg?.totalAccepted ?? 0;
    totalDamaged = lineAgg?.totalDamaged ?? 0;
    totalRejected = lineAgg?.totalRejected ?? 0;
  } else {
    const lineAggConditions = [eq(receiptLines.tenantId, query.tenantId)];
    const [lineAgg] = await db
      .select({
        totalLines: sql<number>`count(*)`,
        totalAccepted: sql<number>`coalesce(sum(${receiptLines.quantityAccepted}), 0)`,
        totalDamaged: sql<number>`coalesce(sum(${receiptLines.quantityDamaged}), 0)`,
        totalRejected: sql<number>`coalesce(sum(${receiptLines.quantityRejected}), 0)`,
      })
      .from(receiptLines)
      .where(and(...lineAggConditions));

    totalLines = lineAgg?.totalLines ?? 0;
    totalAccepted = lineAgg?.totalAccepted ?? 0;
    totalDamaged = lineAgg?.totalDamaged ?? 0;
    totalRejected = lineAgg?.totalRejected ?? 0;
  }

  const totalProcessed = totalAccepted + totalDamaged + totalRejected;
  const acceptanceRate = totalProcessed > 0
    ? Math.round((totalAccepted / totalProcessed) * 10000) / 100
    : 100;

  // ── Exception metrics ──
  const exceptionConditions = [eq(receivingExceptions.tenantId, query.tenantId)];

  const [exceptionOverview] = await db
    .select({
      total: sql<number>`count(*)`,
      open: sql<number>`count(*) filter (where ${receivingExceptions.status} in ('open', 'in_progress'))`,
      resolved: sql<number>`count(*) filter (where ${receivingExceptions.status} = 'resolved')`,
      avgResolutionHours: sql<number | null>`
        avg(
          extract(epoch from (${receivingExceptions.resolvedAt} - ${receivingExceptions.createdAt})) / 3600
        ) filter (where ${receivingExceptions.resolvedAt} is not null)
      `,
    })
    .from(receivingExceptions)
    .where(and(...exceptionConditions));

  const exceptionsByType = await db
    .select({
      exceptionType: receivingExceptions.exceptionType,
      count: sql<number>`count(*)`,
    })
    .from(receivingExceptions)
    .where(and(...exceptionConditions))
    .groupBy(receivingExceptions.exceptionType);

  const exceptionsBySeverity = await db
    .select({
      severity: receivingExceptions.severity,
      count: sql<number>`count(*)`,
    })
    .from(receivingExceptions)
    .where(and(...exceptionConditions))
    .groupBy(receivingExceptions.severity);

  const exceptionsByResolution = await db
    .select({
      resolutionType: sql<string>`coalesce(${receivingExceptions.resolutionType}, 'unresolved')`,
      count: sql<number>`count(*)`,
    })
    .from(receivingExceptions)
    .where(and(...exceptionConditions))
    .groupBy(sql`coalesce(${receivingExceptions.resolutionType}, 'unresolved')`);

  // ── Throughput metrics ──
  const receiptsByStatus = await db
    .select({
      status: receipts.status,
      count: sql<number>`count(*)`,
    })
    .from(receipts)
    .where(and(...dateConditions))
    .groupBy(receipts.status);

  const receiptsByOrderType = await db
    .select({
      orderType: receipts.orderType,
      count: sql<number>`count(*)`,
    })
    .from(receipts)
    .where(and(...dateConditions))
    .groupBy(receipts.orderType);

  return {
    overview: {
      totalReceipts,
      totalLinesProcessed: totalLines,
      totalUnitsAccepted: totalAccepted,
      totalUnitsDamaged: totalDamaged,
      totalUnitsRejected: totalRejected,
      acceptanceRate,
    },
    exceptions: {
      totalExceptions: exceptionOverview?.total ?? 0,
      openExceptions: exceptionOverview?.open ?? 0,
      resolvedExceptions: exceptionOverview?.resolved ?? 0,
      avgResolutionTimeHours: exceptionOverview?.avgResolutionHours
        ? Math.round(exceptionOverview.avgResolutionHours * 100) / 100
        : null,
      byType: exceptionsByType.map((r) => ({
        exceptionType: r.exceptionType,
        count: r.count,
      })),
      bySeverity: exceptionsBySeverity.map((r) => ({
        severity: r.severity,
        count: r.count,
      })),
      byResolution: exceptionsByResolution.map((r) => ({
        resolutionType: r.resolutionType,
        count: r.count,
      })),
    },
    throughput: {
      receiptsByStatus: receiptsByStatus.map((r) => ({
        status: r.status,
        count: r.count,
      })),
      receiptsByOrderType: receiptsByOrderType.map((r) => ({
        orderType: r.orderType,
        count: r.count,
      })),
    },
  };
}
