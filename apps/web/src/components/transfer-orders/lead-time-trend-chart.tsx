/**
 * LeadTimeTrendChart — Displays lead-time trend over time
 *
 * Uses Recharts to display average lead-time in days as a line chart
 * with Arda Blue (#0a68f3) as the primary line color.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
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
import type { LeadTimeTrendPoint } from "@/types";

interface LeadTimeTrendChartProps {
  data: LeadTimeTrendPoint[];
  loading?: boolean;
  error?: string | null;
}

export function LeadTimeTrendChart({ data, loading, error }: LeadTimeTrendChartProps) {
  const chartData = React.useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((point) => ({
      date: new Date(point.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      avgLeadTimeDays: Number(point.avgLeadTimeDays.toFixed(1)),
      transferCount: point.transferCount,
    }));
  }, [data]);

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Lead-Time Trend</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {loading && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading trend data...
          </div>
        )}
        {!loading && error && (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">
            {error}
          </div>
        )}
        {!loading && !error && chartData.length === 0 && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No trend data available for the selected filters
          </div>
        )}
        {!loading && !error && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
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
                tickFormatter={(value) => `${value}d`}
                label={{
                  value: "Avg Lead Time (days)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number | undefined, name: string | undefined) => {
                  if (value === undefined || name === undefined) return ["", ""];
                  if (name === "avgLeadTimeDays") {
                    return [`${value.toFixed(1)} days`, "Avg Lead Time"];
                  }
                  if (name === "transferCount") {
                    return [`${value} transfers`, "Transfer Count"];
                  }
                  return [value, name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px" }}
                iconType="line"
                formatter={(value) => {
                  if (value === "avgLeadTimeDays") return "Avg Lead Time";
                  if (value === "transferCount") return "Transfer Count";
                  return value;
                }}
              />
              <Line
                type="monotone"
                dataKey="avgLeadTimeDays"
                stroke="#0a68f3"
                strokeWidth={2}
                dot={{ r: 3, fill: "#0a68f3" }}
                activeDot={{ r: 5 }}
                name="avgLeadTimeDays"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
