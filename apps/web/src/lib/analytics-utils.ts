import { KPI_META, type KpiId } from "@/types/analytics";

/**
 * Filters KPIs based on user role visibility
 */
export function filterKpisByRole(kpiIds: KpiId[], userRole: string): KpiId[] {
  return kpiIds.filter((kpiId) => {
    const meta = KPI_META[kpiId];
    return meta.visibleToRoles.includes(userRole);
  });
}

/**
 * Checks if a specific KPI is visible to a user role
 */
export function isKpiVisibleToRole(kpiId: KpiId, userRole: string): boolean {
  const meta = KPI_META[kpiId];
  return meta.visibleToRoles.includes(userRole);
}
