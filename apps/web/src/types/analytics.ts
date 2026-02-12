/* ── Analytics KPI Types ────────────────────────────────────── */

export type KpiId =
  | "fill_rate"
  | "supplier_otd"
  | "stockout_count"
  | "avg_cycle_time"
  | "order_accuracy";

export type TrendPeriod = 30 | 60 | 90;

export interface KpiValue {
  kpiId: KpiId;
  value: number;
  unit: string;
  delta: number;
  deltaPercent: number;
  threshold: number | null;
  isNegativeGood: boolean;
  sparklineData: Array<{ timestamp: string; value: number }>;
  lastUpdated: string;
}

export interface KpiTrendDataPoint {
  timestamp: string;
  date: string;
  value: number;
  facilityId?: string;
  facilityName?: string;
}

export interface KpiTrendData {
  kpiId: KpiId;
  period: TrendPeriod;
  dataPoints: KpiTrendDataPoint[];
  facilities: Array<{ id: string; name: string }>;
}

export interface KpiAggregatesResponse {
  data: KpiValue[];
}

export interface KpiTrendResponse {
  data: KpiTrendData;
}

export const KPI_META: Record<
  KpiId,
  {
    label: string;
    description: string;
    unit: string;
    isNegativeGood: boolean;
    defaultThreshold: number | null;
    visibleToRoles: string[];
  }
> = {
  fill_rate: {
    label: "Fill Rate",
    description: "Percentage of orders fulfilled completely on first attempt",
    unit: "%",
    isNegativeGood: false,
    defaultThreshold: 95,
    visibleToRoles: ["tenant_admin", "inventory_manager", "procurement_manager", "executive"],
  },
  supplier_otd: {
    label: "Supplier OTD",
    description: "Supplier on-time delivery percentage",
    unit: "%",
    isNegativeGood: false,
    defaultThreshold: 90,
    visibleToRoles: ["tenant_admin", "procurement_manager", "executive"],
  },
  stockout_count: {
    label: "Stockout Count",
    description: "Number of stockout incidents in the period",
    unit: "incidents",
    isNegativeGood: true,
    defaultThreshold: 5,
    visibleToRoles: ["tenant_admin", "inventory_manager", "executive"],
  },
  avg_cycle_time: {
    label: "Avg Cycle Time",
    description: "Average kanban card cycle time in hours",
    unit: "hrs",
    isNegativeGood: true,
    defaultThreshold: 72,
    visibleToRoles: ["tenant_admin", "inventory_manager", "executive"],
  },
  order_accuracy: {
    label: "Order Accuracy",
    description: "Percentage of orders received without discrepancies",
    unit: "%",
    isNegativeGood: false,
    defaultThreshold: 98,
    visibleToRoles: ["tenant_admin", "receiving_manager", "executive"],
  },
};
