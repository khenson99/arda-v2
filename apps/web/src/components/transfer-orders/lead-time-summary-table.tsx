/**
 * LeadTimeSummaryTable — Displays lead-time summary statistics
 *
 * Shows avg, median, p90, min, max lead times and transfer count
 * for each route/part combination.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Skeleton } from "@/components/ui";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import type { LeadTimeSummaryRow } from "@/types";

interface LeadTimeSummaryTableProps {
  data: LeadTimeSummaryRow[];
  loading?: boolean;
  error?: string | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function LeadTimeSummaryTable({
  data,
  loading,
  error,
  page,
  totalPages,
  onPageChange,
}: LeadTimeSummaryTableProps) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Lead-Time Summary</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {!loading && error && (
          <div className="py-12 text-center text-sm text-destructive">{error}</div>
        )}
        {!loading && !error && data.length === 0 && (
          <div className="py-12 text-center">
            <TrendingUp className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No lead-time data available for the selected filters
            </p>
          </div>
        )}
        {!loading && !error && data.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                      Route
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                      Part
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                      Avg (days)
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                      Median (days)
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                      P90 (days)
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                      Min (days)
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                      Max (days)
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                      Transfers
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.map((row) => (
                    <tr key={row.routeKey} className="hover:bg-muted/50">
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.sourceFacilityName}</div>
                        <div className="text-muted-foreground">→ {row.destinationFacilityName}</div>
                      </td>
                      <td className="px-3 py-2">
                        {row.partNumber ? (
                          <>
                            <div className="font-medium">{row.partNumber}</div>
                            {row.partName && (
                              <div className="text-muted-foreground">{row.partName}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">All parts</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {row.avgLeadTimeDays.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.medianLeadTimeDays.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.p90LeadTimeDays.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {row.minLeadTimeDays.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {row.maxLeadTimeDays.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.transferCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 border-t border-border py-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
