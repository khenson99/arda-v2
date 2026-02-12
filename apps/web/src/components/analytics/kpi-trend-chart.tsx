import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { KpiTrendData, TrendPeriod } from "@/types/analytics";

interface KpiTrendChartProps {
  kpiId: string;
  title: string;
  unit: string;
  data: KpiTrendData | null;
  loading?: boolean;
  onPeriodChange: (period: TrendPeriod) => void;
  selectedPeriod: TrendPeriod;
}

const PERIOD_OPTIONS: Array<{ value: TrendPeriod; label: string }> = [
  { value: 30, label: "30d" },
  { value: 60, label: "60d" },
  { value: 90, label: "90d" },
];

const FACILITY_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--arda-success))",
  "hsl(var(--arda-warning))",
  "hsl(var(--secondary-foreground))",
];

export function KpiTrendChart({
  kpiId,
  title,
  unit,
  data,
  loading,
  onPeriodChange,
  selectedPeriod,
}: KpiTrendChartProps) {
  const chartData = React.useMemo(() => {
    if (!data || !data.dataPoints.length) return [];

    const groupedByDate = new Map<string, Record<string, number>>();

    data.dataPoints.forEach((point) => {
      const existing = groupedByDate.get(point.date) || {};
      const facilityKey = point.facilityId || "overall";
      existing[facilityKey] = point.value;
      groupedByDate.set(point.date, existing);
    });

    return Array.from(groupedByDate.entries())
      .map(([date, values]) => ({
        date,
        ...values,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const facilities = React.useMemo(() => {
    if (!data || !data.facilities.length) return [{ id: "overall", name: "Overall" }];
    return data.facilities;
  }, [data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={selectedPeriod === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => onPeriodChange(option.value)}
              className="h-7 px-2 text-xs"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {loading && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading trend data...
          </div>
        )}
        {!loading && chartData.length === 0 && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No trend data available for this period
          </div>
        )}
        {!loading && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}${unit}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number | undefined) =>
                  value !== undefined ? [`${value.toFixed(1)}${unit}`, ""] : ["", ""]
                }
              />
              <Legend
                wrapperStyle={{ fontSize: "12px" }}
                iconType="line"
                formatter={(value) => {
                  const facility = facilities.find((f) => f.id === value);
                  return facility?.name || value;
                }}
              />
              {facilities.map((facility, index) => (
                <Line
                  key={facility.id}
                  type="monotone"
                  dataKey={facility.id}
                  stroke={FACILITY_COLORS[index % FACILITY_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  name={facility.id}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
