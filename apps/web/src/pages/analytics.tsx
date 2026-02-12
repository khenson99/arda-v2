import * as React from "react";
import { useKpiAggregates, useKpiTrend } from "@/hooks/use-analytics";
import { KpiTile, KpiTrendChart } from "@/components/analytics";
import { filterKpisByRole } from "@/lib/analytics-utils";
import { KPI_META, type KpiId, type TrendPeriod } from "@/types/analytics";
import { Skeleton } from "@/components/ui";
import type { AuthSession } from "@/types";

interface AnalyticsPageProps {
  session: AuthSession;
}

const ALL_KPI_IDS: KpiId[] = [
  "fill_rate",
  "supplier_otd",
  "stockout_count",
  "avg_cycle_time",
  "order_accuracy",
];

export function AnalyticsPage({ session }: AnalyticsPageProps) {
  const token = session.tokens.accessToken;
  const userRole = session.user.role;

  const { data: kpiData, loading: kpiLoading } = useKpiAggregates(token);

  const [selectedPeriods, setSelectedPeriods] = React.useState<Record<KpiId, TrendPeriod>>(
    ALL_KPI_IDS.reduce(
      (acc, kpiId) => ({ ...acc, [kpiId]: 30 }),
      {} as Record<KpiId, TrendPeriod>,
    ),
  );

  const visibleKpiIds = React.useMemo(
    () => filterKpisByRole(ALL_KPI_IDS, userRole),
    [userRole],
  );

  const visibleKpis = React.useMemo(() => {
    if (!kpiData) return [];
    return kpiData.filter((kpi) => visibleKpiIds.includes(kpi.kpiId as KpiId));
  }, [kpiData, visibleKpiIds]);

  const handlePeriodChange = (kpiId: KpiId, period: TrendPeriod) => {
    setSelectedPeriods((prev) => ({ ...prev, [kpiId]: period }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Key performance indicators and trend analysis
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold">KPI Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {kpiLoading &&
            visibleKpiIds.map((kpiId) => (
              <Skeleton key={kpiId} className="h-40 w-full rounded-xl" />
            ))}
          {!kpiLoading &&
            visibleKpis.map((kpi) => <KpiTile key={kpi.kpiId} kpi={kpi} />)}
          {!kpiLoading && visibleKpis.length === 0 && (
            <div className="col-span-full flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              No KPIs available for your role
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Trend Analysis</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleKpiIds.map((kpiId) => (
            <KpiTrendChartWrapper
              key={kpiId}
              kpiId={kpiId}
              token={token}
              selectedPeriod={selectedPeriods[kpiId]}
              onPeriodChange={(period) => handlePeriodChange(kpiId, period)}
            />
          ))}
          {visibleKpiIds.length === 0 && (
            <div className="col-span-full flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              No trend data available for your role
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function KpiTrendChartWrapper({
  kpiId,
  token,
  selectedPeriod,
  onPeriodChange,
}: {
  kpiId: KpiId;
  token: string;
  selectedPeriod: TrendPeriod;
  onPeriodChange: (period: TrendPeriod) => void;
}) {
  const { data, loading } = useKpiTrend(token, kpiId, selectedPeriod);
  const meta = KPI_META[kpiId];

  return (
    <KpiTrendChart
      kpiId={kpiId}
      title={meta.label}
      unit={meta.unit}
      data={data}
      loading={loading}
      selectedPeriod={selectedPeriod}
      onPeriodChange={onPeriodChange}
    />
  );
}

export function AnalyticsRoute({ session }: { session: AuthSession }) {
  return <AnalyticsPage session={session} />;
}
