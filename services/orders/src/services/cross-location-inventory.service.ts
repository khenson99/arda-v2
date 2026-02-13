/**
 * Cross-Location Inventory Service
 *
 * Provides cross-location inventory views — showing inventory levels for
 * parts across all facilities. Used for network-wide visibility, reorder
 * alerting, and transfer-order planning.
 *
 * Functions:
 *   getCrossLocationMatrix  — paginated part × facility inventory matrix
 *   getCrossLocationSummary — aggregate KPIs across the entire network
 */

import { db, schema } from '@arda/db';
import { eq, and, sql, inArray, lt, gte } from 'drizzle-orm';

const { inventoryLedger, facilities, leadTimeHistory, transferOrders } = schema;

// ─── Types ────────────────────────────────────────────────────────────

export interface CrossLocationMatrixInput {
  tenantId: string;
  partIds?: string[];
  facilityIds?: string[];
  belowReorderOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface FacilityInventory {
  facilityId: string;
  facilityName: string;
  facilityCode: string;
  qtyOnHand: number;
  qtyReserved: number;
  qtyInTransit: number;
  available: number;
  reorderPoint: number;
  reorderQty: number;
  belowReorder: boolean;
  nearReorder: boolean;
}

export interface PartRow {
  partId: string;
  facilities: FacilityInventory[];
  totalOnHand: number;
  totalReserved: number;
  totalInTransit: number;
  totalAvailable: number;
}

export interface CrossLocationMatrixResult {
  data: PartRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CrossLocationSummaryInput {
  tenantId: string;
}

export interface CrossLocationSummaryResult {
  totalFacilities: number;
  totalParts: number;
  totalOnHand: number;
  totalReserved: number;
  totalInTransit: number;
  totalAvailable: number;
  facilitiesBelowReorder: number;
  partsWithShortage: number;
  avgNetworkLeadTimeDays: number | null;
  pendingTransferCount: number;
}

// ─── getCrossLocationMatrix ──────────────────────────────────────────

/**
 * Build a part × facility inventory matrix showing stock levels across
 * all active facilities for the tenant.
 *
 * Results are paginated by distinct part (not by row).
 */
export async function getCrossLocationMatrix(
  input: CrossLocationMatrixInput
): Promise<CrossLocationMatrixResult> {
  const {
    tenantId,
    partIds,
    facilityIds,
    belowReorderOnly = false,
    page = 1,
    pageSize = 50,
  } = input;

  // 1. Build WHERE conditions
  const conditions = [
    eq(inventoryLedger.tenantId, tenantId),
    eq(facilities.isActive, true),
  ];

  if (partIds && partIds.length > 0) {
    conditions.push(inArray(inventoryLedger.partId, partIds));
  }
  if (facilityIds && facilityIds.length > 0) {
    conditions.push(inArray(inventoryLedger.facilityId, facilityIds));
  }

  // 2. Query all matching inventory rows joined with facility info
  const rows = await db
    .select({
      partId: inventoryLedger.partId,
      facilityId: facilities.id,
      facilityName: facilities.name,
      facilityCode: facilities.code,
      qtyOnHand: inventoryLedger.qtyOnHand,
      qtyReserved: inventoryLedger.qtyReserved,
      qtyInTransit: inventoryLedger.qtyInTransit,
      reorderPoint: inventoryLedger.reorderPoint,
      reorderQty: inventoryLedger.reorderQty,
    })
    .from(inventoryLedger)
    .innerJoin(facilities, eq(inventoryLedger.facilityId, facilities.id))
    .where(and(...conditions));

  // 3. Group by partId
  const partMap = new Map<string, FacilityInventory[]>();

  for (const row of rows) {
    const available = row.qtyOnHand - row.qtyReserved;
    const belowReorder = row.qtyOnHand < row.reorderPoint;
    const nearReorder =
      !belowReorder && row.reorderPoint > 0 && row.qtyOnHand <= row.reorderPoint * 1.2;

    const facilityInv: FacilityInventory = {
      facilityId: row.facilityId,
      facilityName: row.facilityName,
      facilityCode: row.facilityCode,
      qtyOnHand: row.qtyOnHand,
      qtyReserved: row.qtyReserved,
      qtyInTransit: row.qtyInTransit,
      available,
      reorderPoint: row.reorderPoint,
      reorderQty: row.reorderQty,
      belowReorder,
      nearReorder,
    };

    const existing = partMap.get(row.partId);
    if (existing) {
      existing.push(facilityInv);
    } else {
      partMap.set(row.partId, [facilityInv]);
    }
  }

  // 4. Build PartRow array with totals
  let partRows: PartRow[] = [];

  for (const [partId, facilityList] of partMap) {
    const totalOnHand = facilityList.reduce((sum, f) => sum + f.qtyOnHand, 0);
    const totalReserved = facilityList.reduce((sum, f) => sum + f.qtyReserved, 0);
    const totalInTransit = facilityList.reduce((sum, f) => sum + f.qtyInTransit, 0);
    const totalAvailable = facilityList.reduce((sum, f) => sum + f.available, 0);

    partRows.push({
      partId,
      facilities: facilityList,
      totalOnHand,
      totalReserved,
      totalInTransit,
      totalAvailable,
    });
  }

  // 5. Filter belowReorderOnly — keep only parts where at least one facility is below reorder
  if (belowReorderOnly) {
    partRows = partRows.filter((pr) =>
      pr.facilities.some((f) => f.belowReorder)
    );
  }

  // 6. Paginate by parts
  const total = partRows.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const paginatedData = partRows.slice(offset, offset + pageSize);

  return {
    data: paginatedData,
    pagination: { page, pageSize, total, totalPages },
  };
}

// ─── getCrossLocationSummary ─────────────────────────────────────────

/**
 * Aggregate KPIs across the entire inventory network for a tenant.
 */
export async function getCrossLocationSummary(
  input: CrossLocationSummaryInput
): Promise<CrossLocationSummaryResult> {
  const { tenantId } = input;

  // 1. Aggregate totals from inventoryLedger (only active facilities)
  const [totalsResult] = await db
    .select({
      totalOnHand: sql<number>`coalesce(sum(${inventoryLedger.qtyOnHand}), 0)::int`,
      totalReserved: sql<number>`coalesce(sum(${inventoryLedger.qtyReserved}), 0)::int`,
      totalInTransit: sql<number>`coalesce(sum(${inventoryLedger.qtyInTransit}), 0)::int`,
      totalParts: sql<number>`count(distinct ${inventoryLedger.partId})::int`,
      totalFacilities: sql<number>`count(distinct ${inventoryLedger.facilityId})::int`,
    })
    .from(inventoryLedger)
    .innerJoin(facilities, eq(inventoryLedger.facilityId, facilities.id))
    .where(
      and(
        eq(inventoryLedger.tenantId, tenantId),
        eq(facilities.isActive, true)
      )
    );

  const totalOnHand = totalsResult?.totalOnHand ?? 0;
  const totalReserved = totalsResult?.totalReserved ?? 0;
  const totalInTransit = totalsResult?.totalInTransit ?? 0;
  const totalAvailable = totalOnHand - totalReserved;

  // 2. Count facility-part combos below reorder point
  const [belowReorderResult] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(inventoryLedger)
    .innerJoin(facilities, eq(inventoryLedger.facilityId, facilities.id))
    .where(
      and(
        eq(inventoryLedger.tenantId, tenantId),
        eq(facilities.isActive, true),
        lt(inventoryLedger.qtyOnHand, inventoryLedger.reorderPoint)
      )
    );

  const facilitiesBelowReorder = belowReorderResult?.count ?? 0;

  // 3. Count distinct parts where any facility is below reorder
  const [partsShortageResult] = await db
    .select({
      count: sql<number>`count(distinct ${inventoryLedger.partId})::int`,
    })
    .from(inventoryLedger)
    .innerJoin(facilities, eq(inventoryLedger.facilityId, facilities.id))
    .where(
      and(
        eq(inventoryLedger.tenantId, tenantId),
        eq(facilities.isActive, true),
        lt(inventoryLedger.qtyOnHand, inventoryLedger.reorderPoint)
      )
    );

  const partsWithShortage = partsShortageResult?.count ?? 0;

  // 4. Average network lead time from last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [leadTimeResult] = await db
    .select({
      avgLeadTime: sql<number | null>`avg(${leadTimeHistory.leadTimeDays}::float)`,
    })
    .from(leadTimeHistory)
    .where(
      and(
        eq(leadTimeHistory.tenantId, tenantId),
        gte(leadTimeHistory.createdAt, ninetyDaysAgo)
      )
    );

  const avgNetworkLeadTimeDays = leadTimeResult?.avgLeadTime != null
    ? Math.round(leadTimeResult.avgLeadTime * 100) / 100
    : null;

  // 5. Count pending transfer orders
  const pendingStatuses = ['draft', 'requested', 'approved', 'picking', 'shipped', 'in_transit'] as const;

  const [transferResult] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(transferOrders)
    .where(
      and(
        eq(transferOrders.tenantId, tenantId),
        inArray(transferOrders.status, [...pendingStatuses])
      )
    );

  const pendingTransferCount = transferResult?.count ?? 0;

  return {
    totalFacilities: totalsResult?.totalFacilities ?? 0,
    totalParts: totalsResult?.totalParts ?? 0,
    totalOnHand,
    totalReserved,
    totalInTransit,
    totalAvailable,
    facilitiesBelowReorder,
    partsWithShortage,
    avgNetworkLeadTimeDays,
    pendingTransferCount,
  };
}
