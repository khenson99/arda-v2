import * as React from "react";
import {
  Package,
  AlertTriangle,
  Clock,
  TrendingUp,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Card, Skeleton } from "@/components/ui";
import type { ReceivingMetrics as ReceivingMetricsType } from "@/types";

/* ── KPI Card ─────────────────────────────────────────────── */

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accentClass?: string;
}

function KpiCard({ icon, label, value, sub, accentClass }: KpiCardProps) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          accentClass ?? "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-tight text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}

/* ── Bar chart (pure CSS) ─────────────────────────────────── */

interface BarChartProps {
  data: Array<{ date: string; count: number }>;
}

function ReceiptsByDayChart({ data }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        No data to display
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1.5" style={{ height: 140 }}>
      {data.map((d) => {
        const heightPct = (d.count / maxCount) * 100;
        const dateObj = new Date(d.date);
        const dayLabel = dateObj.toLocaleDateString("en-US", { weekday: "short" });
        const dateLabel = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });

        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-medium text-foreground">{d.count}</span>
            <div
              className="w-full min-w-[16px] rounded-t-md bg-[hsl(var(--link))] transition-all"
              style={{ height: `${Math.max(heightPct, 4)}%` }}
              title={`${dateLabel}: ${d.count} receipts`}
            />
            <span className="text-[10px] text-muted-foreground">{dayLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Loading skeleton ─────────────────────────────────────── */

function MetricsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="flex items-start gap-3 p-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-12" />
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <Skeleton className="mb-3 h-4 w-32" />
        <Skeleton className="h-[140px] w-full rounded-lg" />
      </Card>
    </div>
  );
}

/* ── Props ─────────────────────────────────────────────────── */

interface Props {
  metrics: ReceivingMetricsType | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}

/* ── Component ─────────────────────────────────────────────── */

export function ReceivingMetrics({ metrics, isLoading, error, onRefresh }: Props) {
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  if (isLoading && !metrics) {
    return <MetricsSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void handleRefresh()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
        <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No metrics available</p>
        <p className="text-xs text-muted-foreground">
          Metrics will appear once receipts have been processed.
        </p>
      </div>
    );
  }

  const formatRate = (rate: number | null): string => {
    if (rate === null) return "-";
    return `${(rate * 100).toFixed(1)}%`;
  };

  const formatHours = (hours: number | null): string => {
    if (hours === null) return "-";
    return `${hours.toFixed(1)}h`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          icon={<Package className="h-5 w-5" />}
          label="Total Receipts"
          value={String(metrics.totalReceipts)}
          accentClass="bg-[hsl(var(--link)/0.1)] text-[hsl(var(--link))]"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Total Exceptions"
          value={String(metrics.totalExceptions)}
          accentClass={
            metrics.totalExceptions > 0
              ? "bg-amber-50 text-amber-700"
              : "bg-muted text-muted-foreground"
          }
        />
        <KpiCard
          icon={<Clock className="h-5 w-5" />}
          label="Avg Receiving Time"
          value={formatHours(metrics.avgReceivingTimeHours)}
          sub="per receipt"
          accentClass="bg-violet-50 text-violet-700"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="On-Time Delivery"
          value={formatRate(metrics.onTimeDeliveryRate)}
          accentClass="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          icon={<BarChart3 className="h-5 w-5" />}
          label="Exception Rate"
          value={formatRate(metrics.exceptionRate)}
          accentClass={
            metrics.exceptionRate !== null && metrics.exceptionRate > 0.1
              ? "bg-red-50 text-red-700"
              : "bg-muted text-muted-foreground"
          }
        />
      </div>

      {/* Receipts by day chart */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Receipts by Day</h3>
        <ReceiptsByDayChart data={metrics.receiptsByDay} />
      </Card>
    </div>
  );
}
