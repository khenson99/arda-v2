import * as React from "react";
import { Package, CalendarClock, Truck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Badge, Card, Skeleton } from "@/components/ui";
import type { PurchaseOrder } from "@/types";
import { PO_STATUS_META } from "@/types";

/* ── Helpers ──────────────────────────────────────────────── */

function computeReceivedRatio(po: PurchaseOrder): { received: number; ordered: number; pct: number } {
  const lines = po.lines ?? [];
  if (lines.length === 0) return { received: 0, ordered: 0, pct: 0 };

  let totalOrdered = 0;
  let totalReceived = 0;
  for (const line of lines) {
    totalOrdered += line.quantityOrdered;
    totalReceived += line.quantityReceived;
  }

  const pct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
  return { received: totalReceived, ordered: totalOrdered, pct };
}

function formatDate(iso: string | null): string {
  if (!iso) return "Not set";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

/* ── Loading skeleton ─────────────────────────────────────── */

function ExpectedSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="p-4">
          <Skeleton className="mb-3 h-5 w-32" />
          <Skeleton className="mb-2 h-4 w-48" />
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="mt-4 h-9 w-full" />
        </Card>
      ))}
    </div>
  );
}

/* ── Props ─────────────────────────────────────────────────── */

interface Props {
  purchaseOrders: PurchaseOrder[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onStartReceiving: (poId: string) => Promise<void>;
}

/* ── Component ─────────────────────────────────────────────── */

export function ExpectedDeliveries({
  purchaseOrders,
  isLoading,
  error,
  onRefresh,
  onStartReceiving,
}: Props) {
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  if (isLoading && purchaseOrders.length === 0) {
    return <ExpectedSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          Retry
        </Button>
      </div>
    );
  }

  if (purchaseOrders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
        <Truck className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No expected deliveries</p>
        <p className="text-xs text-muted-foreground">
          Purchase orders in Sent, Acknowledged, or Partially Received status will appear here.
        </p>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {purchaseOrders.length} expected deliver{purchaseOrders.length === 1 ? "y" : "ies"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {purchaseOrders.map((po) => {
          const { received, ordered, pct } = computeReceivedRatio(po);
          const overdue = isOverdue(po.expectedDeliveryDate);
          const meta = PO_STATUS_META[po.status];

          return (
            <Card key={po.id} className="flex flex-col p-4">
              {/* PO Number + Status */}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">
                    {po.poNumber}
                  </span>
                </div>
                <Badge variant={meta?.variant === "destructive" ? "destructive" : meta?.variant === "outline" ? "outline" : "accent"}>
                  {meta?.label ?? po.status}
                </Badge>
              </div>

              {/* Supplier */}
              <p className="mb-1 text-sm text-foreground">
                <span className="text-muted-foreground">Supplier: </span>
                <span className="font-semibold">{po.supplierName ?? "Unknown"}</span>
              </p>

              {/* Expected date */}
              <div className="mb-3 flex items-center gap-1.5">
                <CalendarClock className={cn("h-3.5 w-3.5", overdue ? "text-destructive" : "text-muted-foreground")} />
                <span className={cn("text-xs", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                  {overdue ? "Overdue - " : "Expected: "}
                  {formatDate(po.expectedDeliveryDate)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Received</span>
                <span className="font-medium text-foreground">
                  {received} / {ordered} ({pct}%)
                </span>
              </div>
              <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-[hsl(var(--link))]" : "bg-muted-foreground/30",
                  )}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>

              {/* Action */}
              <Button
                size="sm"
                className="mt-auto w-full"
                onClick={() => void onStartReceiving(po.id)}
              >
                Start Receiving
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
