/**
 * Analytics Routes (Ticket #170)
 *
 * CSV export endpoints for KPI drilldowns and summary data.
 * Supports streaming exports with safe encoding and stable filenames.
 */

import { Router } from 'express';
import { Readable } from 'stream';
import type { AuthRequest } from '@arda/auth-utils';
import { AppError } from '../middleware/error-handler.js';
import { getProductionMetrics, type ProductionMetricsQuery } from '../services/production-analytics.service.js';
import {
  createCSVStream,
  generateExportFilename,
  createKPISummaryRow,
  type KPIExportContext,
  type KPISummaryRow,
} from '../services/csv-export.service.js';
import { db, schema } from '@arda/db';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { createLogger } from '@arda/config';

const log = createLogger('analytics-routes');

export const analyticsRouter = Router();

const { workOrders, workOrderRoutings, productionQueueEntries, facilities } = schema;

// ─── Helper: Build Query Context ────────────────────────────────────

async function buildExportContext(
  req: AuthRequest,
  kpiName: string
): Promise<KPIExportContext> {
  const facilityId = req.query.facilityId as string | undefined;
  let facilityName: string | undefined;

  if (facilityId) {
    const [facility] = await db
      .select({ name: facilities.name })
      .from(facilities)
      .where(eq(facilities.id, facilityId))
      .limit(1)
      .execute();

    facilityName = facility?.name;
  }

  return {
    kpiName,
    facilityId,
    facilityName,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  };
}

// ─── Helper: Date Conditions ────────────────────────────────────────

function buildDateConditions(
  tenantId: string,
  facilityId?: string,
  dateFrom?: string,
  dateTo?: string
) {
  const conditions = [eq(workOrders.tenantId, tenantId)];

  if (facilityId) {
    conditions.push(eq(workOrders.facilityId, facilityId));
  }
  if (dateFrom) {
    conditions.push(gte(workOrders.createdAt, new Date(dateFrom)));
  }
  if (dateTo) {
    conditions.push(lte(workOrders.createdAt, new Date(dateTo)));
  }

  return conditions;
}

// ─── GET /export/csv/summary — Export KPI Summary ───────────────────
// NOTE: Registered BEFORE the :kpiName parametric route so Express
// matches the literal path "/export/csv/summary" first.

analyticsRouter.get('/export/csv/summary', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const facilityId = req.query.facilityId as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const context = await buildExportContext(authReq, 'kpi-summary');
    const filename = generateExportFilename(context);

    // Fetch all KPIs
    const metrics = await getProductionMetrics({
      tenantId,
      facilityId,
      dateFrom,
      dateTo,
    });

    // Flatten into KPI summary rows
    const kpiValues: Record<string, string | number> = {
      'Total Work Orders': metrics.overview.totalWorkOrders,
      'Completed Work Orders': metrics.overview.completedWorkOrders,
      'Overall Scrap Rate (%)': metrics.overview.overallScrapRate,
      'Overall Completion Rate (%)': metrics.overview.overallCompletionRate,
      'Avg Cycle Time (hours)': metrics.throughput.avgCycleTimeHours ?? 'N/A',
      'Avg Queue Wait Time (hours)': metrics.throughput.avgQueueWaitTimeHours ?? 'N/A',
      'Avg WOs Completed Per Day': metrics.throughput.avgWOsCompletedPerDay,
      'Current Backlog': metrics.queueHealth.currentBacklog,
      'Oldest Item Age (hours)': metrics.queueHealth.oldestItemAgeHours ?? 'N/A',
    };

    const rows = createKPISummaryRow(kpiValues, context);

    const headers = [
      'kpiName',
      'kpiValue',
      'facilityId',
      'facilityName',
      'dateFrom',
      'dateTo',
      'exportedAt',
    ];

    log.info({ facilityId, kpiCount: rows.length }, 'Streaming KPI summary CSV export');

    // Set CSV response headers AFTER queries succeed to avoid ERR_HTTP_HEADERS_SENT
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the CSV response with error handling
    const csvStream = createCSVStream(headers);
    const readable = Readable.from(rows);

    readable.on('error', (err) => { csvStream.destroy(err); });
    csvStream.on('error', (err) => {
      log.error({ err }, 'CSV stream error during summary export');
      if (!res.headersSent) {
        next(err);
      } else {
        res.destroy();
      }
    });

    readable.pipe(csvStream).pipe(res);
  } catch (err) {
    next(err);
  }
});

// ─── GET /export/csv/:kpiName — Export KPI Drilldown as CSV ─────────

analyticsRouter.get('/export/csv/:kpiName', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const kpiName = req.params.kpiName;
    const facilityId = req.query.facilityId as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const context = await buildExportContext(authReq, kpiName);
    const filename = generateExportFilename(context);

    // Route to appropriate drilldown query based on KPI name
    let rows: unknown[] = [];
    let headers: string[] = [];

    switch (kpiName.toLowerCase()) {
      case 'scrap-rate':
        ({ rows, headers } = await getScrapRateDrilldown(tenantId, facilityId, dateFrom, dateTo));
        break;

      case 'cycle-time':
        ({ rows, headers } = await getCycleTimeDrilldown(tenantId, facilityId, dateFrom, dateTo));
        break;

      case 'queue-wait-time':
        ({ rows, headers } = await getQueueWaitTimeDrilldown(tenantId, facilityId, dateFrom, dateTo));
        break;

      case 'work-center-utilization':
        ({ rows, headers } = await getWorkCenterUtilizationDrilldown(tenantId, facilityId, dateFrom, dateTo));
        break;

      case 'throughput':
        ({ rows, headers } = await getThroughputDrilldown(tenantId, facilityId, dateFrom, dateTo));
        break;

      default:
        throw new AppError(400, `Unknown KPI: ${kpiName}`);
    }

    log.info({ kpiName, rowCount: rows.length, facilityId }, 'Streaming CSV export');

    // Set CSV response headers AFTER queries succeed to avoid ERR_HTTP_HEADERS_SENT
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the CSV response with error handling
    const csvStream = createCSVStream(headers);
    const readable = Readable.from(rows);

    readable.on('error', (err) => { csvStream.destroy(err); });
    csvStream.on('error', (err) => {
      log.error({ err }, 'CSV stream error during drilldown export');
      if (!res.headersSent) {
        next(err);
      } else {
        res.destroy();
      }
    });

    readable.pipe(csvStream).pipe(res);
  } catch (err) {
    next(err);
  }
});

// ─── Drilldown Query Functions ──────────────────────────────────────

async function getScrapRateDrilldown(
  tenantId: string,
  facilityId?: string,
  dateFrom?: string,
  dateTo?: string
) {
  const conditions = buildDateConditions(tenantId, facilityId, dateFrom, dateTo);

  const rows = await db
    .select({
      woNumber: workOrders.woNumber,
      partId: workOrders.partId,
      facilityId: workOrders.facilityId,
      quantityToProduce: workOrders.quantityToProduce,
      quantityProduced: workOrders.quantityProduced,
      quantityScrapped: workOrders.quantityScrapped,
      scrapRate: sql<number>`
        case
          when (${workOrders.quantityProduced} + ${workOrders.quantityScrapped}) > 0
          then round((${workOrders.quantityScrapped}::numeric / (${workOrders.quantityProduced} + ${workOrders.quantityScrapped})) * 100, 2)
          else 0
        end
      `,
      status: workOrders.status,
      createdAt: workOrders.createdAt,
    })
    .from(workOrders)
    .where(and(...conditions))
    .execute();

  const headers = [
    'woNumber',
    'partId',
    'facilityId',
    'quantityToProduce',
    'quantityProduced',
    'quantityScrapped',
    'scrapRate',
    'status',
    'createdAt',
  ];

  return { rows, headers };
}

async function getCycleTimeDrilldown(
  tenantId: string,
  facilityId?: string,
  dateFrom?: string,
  dateTo?: string
) {
  const conditions = [
    ...buildDateConditions(tenantId, facilityId, dateFrom, dateTo),
    eq(workOrders.status, 'completed'),
  ];

  const rows = await db
    .select({
      woNumber: workOrders.woNumber,
      partId: workOrders.partId,
      facilityId: workOrders.facilityId,
      actualStartDate: workOrders.actualStartDate,
      actualEndDate: workOrders.actualEndDate,
      cycleTimeHours: sql<number>`
        extract(epoch from (${workOrders.actualEndDate} - ${workOrders.actualStartDate})) / 3600
      `,
      status: workOrders.status,
    })
    .from(workOrders)
    .where(and(...conditions))
    .execute();

  const headers = [
    'woNumber',
    'partId',
    'facilityId',
    'actualStartDate',
    'actualEndDate',
    'cycleTimeHours',
    'status',
  ];

  return { rows, headers };
}

async function getQueueWaitTimeDrilldown(
  tenantId: string,
  facilityId?: string,
  dateFrom?: string,
  dateTo?: string
) {
  const conditions = [eq(productionQueueEntries.tenantId, tenantId)];

  if (facilityId) {
    conditions.push(eq(productionQueueEntries.facilityId, facilityId));
  }
  if (dateFrom) {
    conditions.push(gte(productionQueueEntries.enteredQueueAt, new Date(dateFrom)));
  }
  if (dateTo) {
    conditions.push(lte(productionQueueEntries.enteredQueueAt, new Date(dateTo)));
  }

  const rows = await db
    .select({
      workOrderId: productionQueueEntries.workOrderId,
      facilityId: productionQueueEntries.facilityId,
      enteredQueueAt: productionQueueEntries.enteredQueueAt,
      completedAt: productionQueueEntries.completedAt,
      waitTimeHours: sql<number>`
        extract(epoch from (
          coalesce(${productionQueueEntries.completedAt}, now()) - ${productionQueueEntries.enteredQueueAt}
        )) / 3600
      `,
      priorityScore: productionQueueEntries.priorityScore,
    })
    .from(productionQueueEntries)
    .where(and(...conditions))
    .execute();

  const headers = [
    'workOrderId',
    'facilityId',
    'enteredQueueAt',
    'completedAt',
    'waitTimeHours',
    'priorityScore',
  ];

  return { rows, headers };
}

async function getWorkCenterUtilizationDrilldown(
  tenantId: string,
  facilityId?: string,
  dateFrom?: string,
  dateTo?: string
) {
  // Build date conditions on the joined work_orders table
  const dateConditions: ReturnType<typeof eq>[] = [];
  if (dateFrom) {
    dateConditions.push(gte(workOrders.createdAt, new Date(dateFrom)));
  }
  if (dateTo) {
    dateConditions.push(lte(workOrders.createdAt, new Date(dateTo)));
  }

  // Always JOIN to work_orders to apply date/facility filters consistently
  const joinConditions = [
    eq(workOrderRoutings.tenantId, tenantId),
    ...(facilityId ? [eq(workOrders.facilityId, facilityId)] : []),
    ...dateConditions,
  ];

  const rows = await db
    .select({
      workCenterId: workOrderRoutings.workCenterId,
      woNumber: workOrders.woNumber,
      workOrderId: workOrderRoutings.workOrderId,
      stepNumber: workOrderRoutings.stepNumber,
      operationName: workOrderRoutings.operationName,
      estimatedMinutes: workOrderRoutings.estimatedMinutes,
      actualMinutes: workOrderRoutings.actualMinutes,
      efficiency: sql<number>`
        case
          when ${workOrderRoutings.actualMinutes} > 0
          then round((${workOrderRoutings.estimatedMinutes}::numeric / ${workOrderRoutings.actualMinutes}) * 100, 2)
          else null
        end
      `,
      status: workOrderRoutings.status,
    })
    .from(workOrderRoutings)
    .innerJoin(workOrders, eq(workOrderRoutings.workOrderId, workOrders.id))
    .where(and(...joinConditions))
    .execute();

  const headers = [
    'workCenterId',
    'woNumber',
    'workOrderId',
    'stepNumber',
    'operationName',
    'estimatedMinutes',
    'actualMinutes',
    'efficiency',
    'status',
  ];

  return { rows, headers };
}

async function getThroughputDrilldown(
  tenantId: string,
  facilityId?: string,
  dateFrom?: string,
  dateTo?: string
) {
  const conditions = [
    ...buildDateConditions(tenantId, facilityId, dateFrom, dateTo),
    eq(workOrders.status, 'completed'),
  ];

  const rows = await db
    .select({
      woNumber: workOrders.woNumber,
      partId: workOrders.partId,
      facilityId: workOrders.facilityId,
      quantityToProduce: workOrders.quantityToProduce,
      quantityProduced: workOrders.quantityProduced,
      actualStartDate: workOrders.actualStartDate,
      actualEndDate: workOrders.actualEndDate,
      cycleTimeHours: sql<number>`
        extract(epoch from (${workOrders.actualEndDate} - ${workOrders.actualStartDate})) / 3600
      `,
      isExpedited: workOrders.isExpedited,
      isRework: workOrders.isRework,
    })
    .from(workOrders)
    .where(and(...conditions))
    .execute();

  const headers = [
    'woNumber',
    'partId',
    'facilityId',
    'quantityToProduce',
    'quantityProduced',
    'actualStartDate',
    'actualEndDate',
    'cycleTimeHours',
    'isExpedited',
    'isRework',
  ];

  return { rows, headers };
}
