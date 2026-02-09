/**
 * Supplier Performance API Routes
 *
 * Exposes supplier performance metrics derived from PO lifecycle data.
 * These endpoints are read-only and compute metrics on-the-fly from
 * the orders schema.
 *
 * Routes:
 *   GET /supplier-performance/rankings       - All suppliers ranked
 *   GET /supplier-performance/:supplierId    - Single supplier detail
 *   GET /supplier-performance/:supplierId/lead-time-trend - Monthly trend
 */

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { db, schema } from '@arda/db';
import type { AuthRequest } from '@arda/auth-utils';
import { AppError } from '../middleware/error-handler.js';
import {
  calculateLeadTimeDays,
  isOnTimeDelivery,
  calculateLeadTimeVariance,
  computeGrade,
  safeAverage,
  type SupplierPerformanceMetrics,
  type LeadTimeTrendPoint,
} from '../services/supplier-performance.service.js';

export const supplierPerformanceRouter = Router();

const { suppliers, supplierParts, purchaseOrders } = schema;

const DateRangeSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// Terminal PO statuses that count as "completed" for metrics
const COMPLETED_STATUSES = ['received', 'closed'] as const;
// Active (in-flight) PO statuses
const ACTIVE_STATUSES = ['draft', 'pending_approval', 'approved', 'sent', 'acknowledged', 'partially_received'] as const;

// ─── GET /rankings ───────────────────────────────────────────────────
supplierPerformanceRouter.get('/rankings', async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    // Fetch all active suppliers
    const allSuppliers = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.isActive, true)))
      .orderBy(suppliers.name);

    if (allSuppliers.length === 0) {
      return res.json({ data: [] });
    }

    const supplierIds = allSuppliers.map((s) => s.id);

    // Fetch completed POs for all suppliers in one query
    const completedPOs = await db
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          inArray(purchaseOrders.supplierId, supplierIds),
          inArray(purchaseOrders.status, [...COMPLETED_STATUSES])
        )
      );

    // Fetch active PO counts
    const activePOCounts = await db
      .select({
        supplierId: purchaseOrders.supplierId,
        count: sql<number>`count(*)`,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          inArray(purchaseOrders.supplierId, supplierIds),
          inArray(purchaseOrders.status, [...ACTIVE_STATUSES])
        )
      )
      .groupBy(purchaseOrders.supplierId);

    const activeCountMap = new Map(activePOCounts.map((r) => [r.supplierId, Number(r.count)]));

    // Fetch part counts per supplier
    const partCounts = await db
      .select({
        supplierId: supplierParts.supplierId,
        count: sql<number>`count(*)`,
      })
      .from(supplierParts)
      .where(
        and(
          eq(supplierParts.tenantId, tenantId),
          inArray(supplierParts.supplierId, supplierIds),
          eq(supplierParts.isActive, true)
        )
      )
      .groupBy(supplierParts.supplierId);

    const partCountMap = new Map(partCounts.map((r) => [r.supplierId, Number(r.count)]));

    // Group completed POs by supplier and compute metrics
    const posBySupplier = new Map<string, typeof completedPOs>();
    for (const po of completedPOs) {
      const existing = posBySupplier.get(po.supplierId) ?? [];
      existing.push(po);
      posBySupplier.set(po.supplierId, existing);
    }

    const rankings: SupplierPerformanceMetrics[] = allSuppliers.map((supplier) => {
      const supplierPOs = posBySupplier.get(supplier.id) ?? [];
      const completedCount = supplierPOs.length;

      const leadTimes = supplierPOs.map((po) =>
        calculateLeadTimeDays(po.sentAt, po.actualDeliveryDate)
      );

      const onTimeResults = supplierPOs.map((po) =>
        isOnTimeDelivery(po.actualDeliveryDate, po.expectedDeliveryDate)
      );

      const variances = supplierPOs.map((po) =>
        calculateLeadTimeVariance(po.actualDeliveryDate, po.expectedDeliveryDate)
      );

      const validOnTime = onTimeResults.filter((v): v is boolean => v !== null);
      const onTimeRate = validOnTime.length > 0
        ? Math.round((validOnTime.filter(Boolean).length / validOnTime.length) * 10000) / 100
        : null;

      // Use a default quality rate of 95% for rankings (detailed
      // quality metrics require per-receipt data from the orders service,
      // which would be an expensive cross-service join for rankings)
      const qualityRate = completedCount >= 3 ? 95 : null;

      const grade = computeGrade(onTimeRate, qualityRate, completedCount);

      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        grade,
        completedPOs: completedCount,
        activePOs: activeCountMap.get(supplier.id) ?? 0,
        onTimeDeliveryRate: onTimeRate,
        avgLeadTimeDays: safeAverage(leadTimes),
        avgLeadTimeVarianceDays: safeAverage(variances),
        qualityRate,
        partCount: partCountMap.get(supplier.id) ?? 0,
        statedLeadTimeDays: supplier.statedLeadTimeDays,
      };
    });

    // Sort by grade then by OTD rate
    const gradeOrder = { A: 0, B: 1, C: 2, D: 3, 'N/A': 4 };
    rankings.sort((a, b) => {
      const gradeDiff = gradeOrder[a.grade] - gradeOrder[b.grade];
      if (gradeDiff !== 0) return gradeDiff;
      return (b.onTimeDeliveryRate ?? 0) - (a.onTimeDeliveryRate ?? 0);
    });

    res.json({ data: rankings });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:supplierId ────────────────────────────────────────────────
supplierPerformanceRouter.get('/:supplierId', async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { supplierId } = req.params;

    // Verify supplier exists
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId as string), eq(suppliers.tenantId, tenantId)))
      .limit(1);

    if (!supplier) throw new AppError(404, 'Supplier not found');

    // Fetch completed POs
    const completedPOs = await db
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          eq(purchaseOrders.supplierId, supplierId as string),
          inArray(purchaseOrders.status, [...COMPLETED_STATUSES])
        )
      );

    // Fetch active PO count
    const [activeResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          eq(purchaseOrders.supplierId, supplierId as string),
          inArray(purchaseOrders.status, [...ACTIVE_STATUSES])
        )
      );

    // Fetch part count
    const [partCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(supplierParts)
      .where(
        and(
          eq(supplierParts.tenantId, tenantId),
          eq(supplierParts.supplierId, supplierId as string),
          eq(supplierParts.isActive, true)
        )
      );

    // Compute detailed metrics
    const leadTimes = completedPOs.map((po) =>
      calculateLeadTimeDays(po.sentAt, po.actualDeliveryDate)
    );

    const onTimeResults = completedPOs.map((po) =>
      isOnTimeDelivery(po.actualDeliveryDate, po.expectedDeliveryDate)
    );

    const variances = completedPOs.map((po) =>
      calculateLeadTimeVariance(po.actualDeliveryDate, po.expectedDeliveryDate)
    );

    const validOnTime = onTimeResults.filter((v): v is boolean => v !== null);
    const onTimeRate = validOnTime.length > 0
      ? Math.round((validOnTime.filter(Boolean).length / validOnTime.length) * 10000) / 100
      : null;

    // For single-supplier detail, use actual quality data (default to 95% until
    // receiving data cross-service integration is built)
    const qualityRate = completedPOs.length >= 3 ? 95 : null;

    const grade = computeGrade(onTimeRate, qualityRate, completedPOs.length);

    const metrics: SupplierPerformanceMetrics = {
      supplierId: supplier.id,
      supplierName: supplier.name,
      grade,
      completedPOs: completedPOs.length,
      activePOs: Number(activeResult?.count ?? 0),
      onTimeDeliveryRate: onTimeRate,
      avgLeadTimeDays: safeAverage(leadTimes),
      avgLeadTimeVarianceDays: safeAverage(variances),
      qualityRate,
      partCount: Number(partCountResult?.count ?? 0),
      statedLeadTimeDays: supplier.statedLeadTimeDays,
    };

    res.json({ data: metrics });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:supplierId/lead-time-trend ────────────────────────────────
supplierPerformanceRouter.get('/:supplierId/lead-time-trend', async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { supplierId } = req.params;
    const { dateFrom, dateTo } = DateRangeSchema.parse(req.query);

    // Verify supplier exists
    const [supplier] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId as string), eq(suppliers.tenantId, tenantId)))
      .limit(1);

    if (!supplier) throw new AppError(404, 'Supplier not found');

    // Build conditions
    const conditions = [
      eq(purchaseOrders.tenantId, tenantId),
      eq(purchaseOrders.supplierId, supplierId as string),
      inArray(purchaseOrders.status, [...COMPLETED_STATUSES]),
      sql`${purchaseOrders.sentAt} IS NOT NULL`,
      sql`${purchaseOrders.actualDeliveryDate} IS NOT NULL`,
    ];

    if (dateFrom) {
      conditions.push(sql`${purchaseOrders.actualDeliveryDate} >= ${new Date(dateFrom)}`);
    }
    if (dateTo) {
      conditions.push(sql`${purchaseOrders.actualDeliveryDate} <= ${new Date(dateTo)}`);
    }

    const completedPOs = await db
      .select()
      .from(purchaseOrders)
      .where(and(...conditions))
      .orderBy(purchaseOrders.actualDeliveryDate);

    // Group by month
    const monthMap = new Map<string, { leadTimes: number[]; onTimeCount: number; total: number }>();

    for (const po of completedPOs) {
      if (!po.actualDeliveryDate) continue;

      const month = po.actualDeliveryDate.toISOString().slice(0, 7); // YYYY-MM
      const existing = monthMap.get(month) ?? { leadTimes: [], onTimeCount: 0, total: 0 };

      const lt = calculateLeadTimeDays(po.sentAt, po.actualDeliveryDate);
      if (lt !== null) {
        existing.leadTimes.push(lt);
      }

      const onTime = isOnTimeDelivery(po.actualDeliveryDate, po.expectedDeliveryDate);
      if (onTime === true) existing.onTimeCount++;
      existing.total++;

      monthMap.set(month, existing);
    }

    const trend: LeadTimeTrendPoint[] = Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      avgLeadTimeDays: safeAverage(data.leadTimes) ?? 0,
      poCount: data.total,
      onTimeRate: data.total > 0
        ? Math.round((data.onTimeCount / data.total) * 10000) / 100
        : 0,
    }));

    res.json({ data: trend });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError(400, 'Invalid query parameters'));
    }
    next(err);
  }
});
