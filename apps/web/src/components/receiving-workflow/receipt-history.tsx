import * as React from "react";
import { ClipboardList, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Badge, Card, Skeleton } from "@/components/ui";
import type { Receipt, ReceiptLine } from "@/types";

/* ── Helpers ──────────────────────────────────────────────── */

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function totalItems(receipt: Receipt): number {
  if (!receipt.lines) return 0;
  return receipt.lines.reduce(
    (sum, l) => sum + l.quantityAccepted + l.quantityDamaged + l.quantityRejected,
    0,
  );
}

function statusVariant(status: string): "success" | "warning" | "outline" | "destructive" {
  switch (status) {
    case "completed":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
}

/* ── Receipt detail (expanded row) ────────────────────────── */

interface ReceiptDetailProps {
  lines: ReceiptLine[];
}

function ReceiptDetail({ lines }: ReceiptDetailProps) {
  if (lines.length === 0) {
    return (
      <tr className="border-b border-border bg-muted/20">
        <td colSpan={7} className="px-4 py-3 text-center text-xs text-muted-foreground">
          No line items
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border bg-muted/20">
      <td colSpan={7} className="px-4 py-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1.5 pr-3 font-semibold">Part</th>
              <th className="pb-1.5 pr-3 text-center font-semibold">Accepted</th>
              <th className="pb-1.5 pr-3 text-center font-semibold">Damaged</th>
              <th className="pb-1.5 pr-3 text-center font-semibold">Rejected</th>
              <th className="pb-1.5 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-border/50">
                <td className="py-1.5 pr-3 font-medium text-foreground">
                  {line.partName ?? line.partId}
                </td>
                <td className="py-1.5 pr-3 text-center text-emerald-700">
                  {line.quantityAccepted}
                </td>
                <td className="py-1.5 pr-3 text-center text-amber-700">
                  {line.quantityDamaged > 0 ? line.quantityDamaged : "-"}
                </td>
                <td className="py-1.5 pr-3 text-center text-red-700">
                  {line.quantityRejected > 0 ? line.quantityRejected : "-"}
                </td>
                <td className="max-w-[200px] truncate py-1.5 text-muted-foreground">
                  {line.notes ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

/* ── Loading skeleton ─────────────────────────────────────── */

function HistorySkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="bg-muted px-4 py-3">
        <Skeleton className="h-4 w-48" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4 border-b border-border px-4 py-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-32 flex-1" />
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </Card>
  );
}

/* ── Props ─────────────────────────────────────────────────── */

interface Props {
  receipts: Receipt[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  selectedReceipt: Receipt | null;
  onSelectReceipt: (receipt: Receipt | null) => void;
}

/* ── Component ─────────────────────────────────────────────── */

export function ReceiptHistory({
  receipts,
  isLoading,
  error,
  onRefresh,
  selectedReceipt,
  onSelectReceipt,
}: Props) {
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  if (isLoading && receipts.length === 0) {
    return <HistorySkeleton />;
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

  if (receipts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
        <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No receipt history</p>
        <p className="text-xs text-muted-foreground">
          Completed receipts will appear here after receiving deliveries.
        </p>
        <Button variant="outline" size="sm" onClick={() => void handleRefresh()} className="mt-2">
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
          {receipts.length} receipt{receipts.length === 1 ? "" : "s"}
        </p>
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

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Receipt ID</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Order</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Received By</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Received At</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">Items</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => {
                const isExpanded = selectedReceipt?.id === receipt.id;
                const items = totalItems(receipt);

                return (
                  <React.Fragment key={receipt.id}>
                    <tr
                      className={cn(
                        "cursor-pointer border-b border-border transition-colors hover:bg-muted/50",
                        isExpanded && "bg-muted/30",
                      )}
                      onClick={() => onSelectReceipt(isExpanded ? null : receipt)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className="font-medium text-[hsl(var(--link))]">
                            {receipt.id.slice(0, 8)}...
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {receipt.orderId.slice(0, 8)}...
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={statusVariant(receipt.status)}>
                          {receipt.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        {receipt.receivedBy ?? "-"}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {formatDate(receipt.receivedAt)}
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-foreground">
                        {items > 0 ? items : "-"}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-3 text-xs text-muted-foreground">
                        {receipt.notes ?? "-"}
                      </td>
                    </tr>
                    {isExpanded && receipt.lines && (
                      <ReceiptDetail lines={receipt.lines} />
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
