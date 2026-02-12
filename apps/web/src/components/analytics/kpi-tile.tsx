import { Card, CardContent } from "@/components/ui";
import { TrendingDown, TrendingUp, Minus, AlertTriangle } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { KpiValue } from "@/types/analytics";

interface KpiTileProps {
  kpi: KpiValue;
}

export function KpiTile({ kpi }: KpiTileProps) {
  const isPositiveDelta = kpi.delta > 0;
  const isNeutralDelta = kpi.delta === 0;
  const isThresholdViolated =
    kpi.threshold !== null &&
    (kpi.isNegativeGood
      ? kpi.value > kpi.threshold
      : kpi.value < kpi.threshold);

  const deltaColor = isNeutralDelta
    ? "text-muted-foreground"
    : kpi.isNegativeGood
      ? isPositiveDelta
        ? "text-[hsl(var(--arda-warning))]"
        : "text-[hsl(var(--arda-success))]"
      : isPositiveDelta
        ? "text-[hsl(var(--arda-success))]"
        : "text-[hsl(var(--arda-warning))]";

  const DeltaIcon = isNeutralDelta ? Minus : isPositiveDelta ? TrendingUp : TrendingDown;

  return (
    <Card className={cn("relative", isThresholdViolated && "border-[hsl(var(--arda-warning))]")}>
      {isThresholdViolated && (
        <div className="absolute right-3 top-3">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--arda-warning))]" />
        </div>
      )}
      <CardContent className="p-4">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {kpi.kpiId.replace(/_/g, " ")}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-2xl font-bold">
                {kpi.value.toFixed(1)}
                {kpi.unit}
              </p>
              <div className={cn("flex items-center gap-1 text-xs font-semibold", deltaColor)}>
                <DeltaIcon className="h-3 w-3" />
                <span>
                  {isPositiveDelta ? "+" : ""}
                  {kpi.deltaPercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {kpi.sparklineData.length > 0 && (
            <div className="h-12">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={kpi.sparklineData}>
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {kpi.threshold !== null && (
            <p className="text-xs text-muted-foreground">
              Threshold: {kpi.threshold}
              {kpi.unit}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
