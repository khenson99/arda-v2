import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { OrderStatusBadge } from "@/components/order-history/order-status-badge";
import type { TransferAuditEntry } from "@/types";
import { cn } from "@/lib/utils";
import { Clock, User } from "lucide-react";

interface TransferOrderTimelineProps {
  auditEntries: TransferAuditEntry[];
}

export interface TimelineEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  timestamp: string;
  userId: string | null;
  reason: string | null;
  durationMs: number | null;
}

export function parseAuditEntries(entries: TransferAuditEntry[]): TimelineEntry[] {
  // Filter for status change events and created event
  const statusEvents = entries.filter(
    (e) => e.action === "transfer_order.status_changed" || e.action === "transfer_order.created"
  );

  // Sort by timestamp ascending (oldest first)
  const sorted = [...statusEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const timeline: TimelineEntry[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const prevEntry = i > 0 ? sorted[i - 1] : null;

    const fromStatus = entry.previousState && typeof entry.previousState === "object" && "status" in entry.previousState
      ? String(entry.previousState.status)
      : null;
    const toStatus = entry.newState && typeof entry.newState === "object" && "status" in entry.newState
      ? String(entry.newState.status)
      : "draft";

    // Calculate duration from previous transition
    const durationMs = prevEntry
      ? new Date(entry.timestamp).getTime() - new Date(prevEntry.timestamp).getTime()
      : null;

    // Extract reason from metadata if available
    const reason = entry.metadata && typeof entry.metadata === "object" && "reason" in entry.metadata
      ? String(entry.metadata.reason)
      : null;

    timeline.push({
      id: entry.id,
      fromStatus,
      toStatus,
      timestamp: entry.timestamp,
      userId: entry.userId,
      reason,
      durationMs,
    });
  }

  return timeline;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms === 0) return "0s";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TransferOrderTimeline({ auditEntries }: TransferOrderTimelineProps) {
  const timeline = React.useMemo(() => parseAuditEntries(auditEntries), [auditEntries]);

  if (timeline.length === 0) {
    return (
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Lifecycle Timeline</CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No status history available.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Lifecycle Timeline</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="relative space-y-4">
          {/* Vertical timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />

          {timeline.map((entry, idx) => {
            const isLast = idx === timeline.length - 1;
            const isCancelled = entry.toStatus === "cancelled";

            return (
              <div key={entry.id} className="relative flex gap-4 pb-2">
                {/* Timeline dot */}
                <div
                  className={cn(
                    "relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    isCancelled
                      ? "border-destructive bg-destructive/10"
                      : isLast
                        ? "border-primary bg-primary"
                        : "border-[hsl(var(--arda-success))] bg-[hsl(var(--arda-success-light))]"
                  )}
                >
                  <div
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isCancelled
                        ? "bg-destructive"
                        : isLast
                          ? "bg-white"
                          : "bg-[hsl(var(--arda-success))]"
                    )}
                  />
                </div>

                {/* Timeline content */}
                <div className="flex-1 -mt-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <OrderStatusBadge status={entry.toStatus} type="transfer" />
                    {entry.durationMs !== null && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(entry.durationMs)} from previous
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {formatTimestamp(entry.timestamp)}
                  </p>

                  {entry.userId && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      User ID: {entry.userId.slice(0, 8)}...
                    </p>
                  )}

                  {entry.reason && (
                    <p className="text-xs italic text-muted-foreground">
                      Reason: {entry.reason}
                    </p>
                  )}

                  {isCancelled && entry.fromStatus && (
                    <p className="text-xs text-muted-foreground">
                      Cancelled from: <span className="font-medium">{entry.fromStatus}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
