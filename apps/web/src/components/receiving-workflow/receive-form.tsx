import * as React from "react";
import { CheckCircle2, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, Card, Badge, Skeleton } from "@/components/ui";
import { toast } from "sonner";
import type { PurchaseOrder } from "@/types";
import { PO_STATUS_META } from "@/types";
import type { ReceiveLineState } from "@/hooks/use-receiving";

/* ── PO Selector ──────────────────────────────────────────── */

interface POSelectorProps {
  purchaseOrders: PurchaseOrder[];
  onSelect: (poId: string) => void;
}

function POSelector({ purchaseOrders, onSelect }: POSelectorProps) {
  if (purchaseOrders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          No POs available for receiving. Go to Expected Deliveries to see incoming orders.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Select a purchase order to receive against:</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {purchaseOrders.map((po) => {
          const meta = PO_STATUS_META[po.status];
          return (
            <button
              key={po.id}
              type="button"
              onClick={() => onSelect(po.id)}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/50"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{po.poNumber}</p>
                <p className="text-xs text-muted-foreground">{po.supplierName ?? "Unknown supplier"}</p>
              </div>
              <Badge variant={meta?.variant === "outline" ? "outline" : "accent"}>
                {meta?.label ?? po.status}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Quantity Input Cell ──────────────────────────────────── */

interface QtyInputProps {
  value: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  className?: string;
}

function QtyInput({ value, max, onChange, label, className }: QtyInputProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
        className="h-9 w-20 text-center text-sm"
      />
    </div>
  );
}

/* ── Props ─────────────────────────────────────────────────── */

interface Props {
  selectedPO: PurchaseOrder | null;
  purchaseOrders: PurchaseOrder[];
  receiveLines: ReceiveLineState[];
  receiveNotes: string;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  onSelectPO: (poId: string) => Promise<void>;
  onClearPO: () => void;
  onUpdateLine: (partId: string, field: "quantityAccepted" | "quantityDamaged" | "quantityRejected", value: number) => void;
  onSetNotes: (notes: string) => void;
  onSubmit: () => Promise<string | null>;
  onReceiptCreated: () => void;
}

/* ── Component ─────────────────────────────────────────────── */

export function ReceiveForm({
  selectedPO,
  purchaseOrders,
  receiveLines,
  receiveNotes,
  isLoading,
  isSubmitting,
  error,
  onSelectPO,
  onClearPO,
  onUpdateLine,
  onSetNotes,
  onSubmit,
  onReceiptCreated,
}: Props) {
  const hasAnyQuantity = receiveLines.some(
    (l) => l.quantityAccepted > 0 || l.quantityDamaged > 0 || l.quantityRejected > 0,
  );

  const handleSubmit = async () => {
    const receiptId = await onSubmit();
    if (receiptId) {
      toast.success(`Receipt created: ${receiptId}`, {
        description: "The receipt has been recorded successfully.",
      });
      onReceiptCreated();
    }
  };

  /* If loading PO detail */
  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="mb-4 h-6 w-48" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </Card>
    );
  }

  /* If no PO selected, show selector */
  if (!selectedPO) {
    return (
      <POSelector
        purchaseOrders={purchaseOrders}
        onSelect={(poId) => void onSelectPO(poId)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* PO Header */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClearPO} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{selectedPO.poNumber}</h3>
              <p className="text-xs text-muted-foreground">
                {selectedPO.supplierName ?? "Unknown supplier"}
              </p>
            </div>
          </div>
          <Badge variant="accent">{PO_STATUS_META[selectedPO.status]?.label ?? selectedPO.status}</Badge>
        </div>
      </Card>

      {/* Line items table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Part</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">Ordered</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">Prev Received</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">Remaining</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">Accepted</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">Damaged</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">Rejected</th>
              </tr>
            </thead>
            <tbody>
              {receiveLines.map((line) => {
                const totalInput = line.quantityAccepted + line.quantityDamaged + line.quantityRejected;
                const overRemaining = totalInput > line.quantityRemaining;

                return (
                  <tr
                    key={line.partId}
                    className={cn(
                      "border-b border-border transition-colors hover:bg-muted/50",
                      overRemaining && "bg-amber-50/50",
                    )}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{line.partName}</p>
                      <p className="text-xs text-muted-foreground">{line.partId}</p>
                    </td>
                    <td className="px-3 py-3 text-center font-medium">{line.quantityOrdered}</td>
                    <td className="px-3 py-3 text-center text-muted-foreground">{line.quantityPreviouslyReceived}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("font-medium", line.quantityRemaining === 0 ? "text-emerald-600" : "text-foreground")}>
                        {line.quantityRemaining}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <QtyInput
                        value={line.quantityAccepted}
                        max={line.quantityRemaining}
                        onChange={(v) => onUpdateLine(line.partId, "quantityAccepted", v)}
                        label=""
                        className="items-center"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <QtyInput
                        value={line.quantityDamaged}
                        max={line.quantityRemaining}
                        onChange={(v) => onUpdateLine(line.partId, "quantityDamaged", v)}
                        label=""
                        className="items-center"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <QtyInput
                        value={line.quantityRejected}
                        max={line.quantityRemaining}
                        onChange={(v) => onUpdateLine(line.partId, "quantityRejected", v)}
                        label=""
                        className="items-center"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Notes */}
      <Card className="p-4">
        <label className="mb-2 block text-xs font-semibold text-muted-foreground">
          Receipt Notes
        </label>
        <textarea
          value={receiveNotes}
          onChange={(e) => onSetNotes(e.target.value)}
          placeholder="Optional notes about this receipt..."
          rows={3}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={onClearPO} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || !hasAnyQuantity}
          className="min-w-[140px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Create Receipt
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
