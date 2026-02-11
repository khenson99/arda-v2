/**
 * TOReceiveModal — Receive transfer order
 *
 * Allows confirming receipt of line items, flagging exceptions,
 * and transitioning the transfer order to "received" status.
 */

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Package, AlertCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { isUnauthorized, parseApiError, updateTransferOrderStatus, createReceipt } from "@/lib/api-client";
import type { TransferOrder } from "@/types";

// ─── Props ───────────────────────────────────────────────────────────

export interface TOReceiveModalProps {
  open: boolean;
  onClose: () => void;
  transferOrder: TransferOrder;
  token: string;
  onReceived: () => void;
  onUnauthorized: () => void;
}

interface LineReceiptState {
  quantityAccepted: number;
  quantityDamaged: number;
  quantityRejected: number;
  hasException: boolean;
  notes: string;
}

// ─── Component ───────────────────────────────────────────────────────

export function TOReceiveModal({
  open,
  onClose,
  transferOrder,
  token,
  onReceived,
  onUnauthorized,
}: TOReceiveModalProps) {
  const [lineStates, setLineStates] = React.useState<Record<string, LineReceiptState>>({});
  const [receivingNotes, setReceivingNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      const initial: Record<string, LineReceiptState> = {};
      transferOrder.lines?.forEach((line) => {
        const expectedQty = line.quantityShipped > 0 ? line.quantityShipped : line.quantityRequested;
        initial[line.id] = {
          quantityAccepted: expectedQty,
          quantityDamaged: 0,
          quantityRejected: 0,
          hasException: false,
          notes: "",
        };
      });
      setLineStates(initial);
      setReceivingNotes("");
      setError(null);
    }
  }, [open, transferOrder.lines]);

  const handleLineUpdate = (lineId: string, updates: Partial<LineReceiptState>) => {
    setLineStates((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], ...updates },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate that at least one line has accepted quantity
    const hasAccepted = Object.values(lineStates).some((state) => state.quantityAccepted > 0);
    if (!hasAccepted) {
      setError("At least one line item must have an accepted quantity greater than 0");
      return;
    }

    setSubmitting(true);
    try {
      // Create receipt for the transfer order
      const receiptLines = transferOrder.lines
        ?.map((line) => {
          const state = lineStates[line.id];
          if (!state) return null;
          return {
            partId: line.partId,
            quantityAccepted: state.quantityAccepted,
            quantityDamaged: state.quantityDamaged,
            quantityRejected: state.quantityRejected,
            notes: state.notes || undefined,
          };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null) ?? [];

      await createReceipt(token, {
        orderId: transferOrder.id,
        orderType: "transfer_order",
        lines: receiptLines,
        notes: receivingNotes || undefined,
      });

      // Transition to "received" status
      await updateTransferOrderStatus(token, transferOrder.id, {
        status: "received",
        reason: receivingNotes || "Received from UI",
      });

      toast.success("Transfer order received");
      onReceived();
      onClose();
    } catch (err) {
      if (isUnauthorized(err)) {
        onUnauthorized();
        return;
      }
      setError(parseApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const hasExceptions = Object.values(lineStates).some((state) => state.hasException);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Receive Transfer Order
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Error message */}
          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-red-600 dark:text-red-400">{error}</span>
            </div>
          )}

          {/* Transfer details */}
          <Card className="rounded-lg">
            <CardContent className="p-3 space-y-1 text-sm">
              <div className="name-value-pair">
                <span className="text-muted-foreground">TO Number:</span>{" "}
                <span className="font-semibold">{transferOrder.toNumber}</span>
              </div>
              <div className="name-value-pair">
                <span className="text-muted-foreground">From:</span>{" "}
                <span className="font-semibold">{transferOrder.sourceFacilityName ?? transferOrder.sourceFacilityId}</span>
              </div>
              <div className="name-value-pair">
                <span className="text-muted-foreground">To:</span>{" "}
                <span className="font-semibold">{transferOrder.destinationFacilityName ?? transferOrder.destinationFacilityId}</span>
              </div>
            </CardContent>
          </Card>

          {/* Exception warning */}
          {hasExceptions && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              <span className="text-yellow-600 dark:text-yellow-400">
                One or more line items have exceptions. Please review damaged or rejected quantities.
              </span>
            </div>
          )}

          {/* Line items with receipt quantities */}
          <div className="space-y-2">
            <Label>Receiving Details</Label>
            <div className="space-y-3">
              {transferOrder.lines?.map((line) => {
                const state = lineStates[line.id];
                if (!state) return null;

                const expectedQty = line.quantityShipped > 0 ? line.quantityShipped : line.quantityRequested;
                const totalReceived = state.quantityAccepted + state.quantityDamaged + state.quantityRejected;
                const hasDiscrepancy = totalReceived !== expectedQty;

                return (
                  <Card key={line.id} className="rounded-lg">
                    <CardContent className="p-3 space-y-3">
                      <div>
                        <p className="font-semibold text-sm">{line.partName ?? line.partId}</p>
                        <p className="text-xs text-muted-foreground">
                          Expected: {expectedQty} {hasDiscrepancy && <span className="text-yellow-600 font-semibold">· Received: {totalReceived}</span>}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor={`${line.id}_accepted`} className="text-xs">Accepted</Label>
                          <Input
                            id={`${line.id}_accepted`}
                            type="number"
                            min={0}
                            value={state.quantityAccepted}
                            onChange={(e) =>
                              handleLineUpdate(line.id, { quantityAccepted: parseInt(e.target.value, 10) || 0 })
                            }
                            className="text-center h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${line.id}_damaged`} className="text-xs">Damaged</Label>
                          <Input
                            id={`${line.id}_damaged`}
                            type="number"
                            min={0}
                            value={state.quantityDamaged}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              handleLineUpdate(line.id, {
                                quantityDamaged: val,
                                hasException: val > 0 || state.quantityRejected > 0,
                              });
                            }}
                            className="text-center h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${line.id}_rejected`} className="text-xs">Rejected</Label>
                          <Input
                            id={`${line.id}_rejected`}
                            type="number"
                            min={0}
                            value={state.quantityRejected}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              handleLineUpdate(line.id, {
                                quantityRejected: val,
                                hasException: val > 0 || state.quantityDamaged > 0,
                              });
                            }}
                            className="text-center h-9"
                          />
                        </div>
                      </div>

                      {(state.hasException || hasDiscrepancy) && (
                        <div className="space-y-1">
                          <Label htmlFor={`${line.id}_notes`} className="text-xs">Exception Notes</Label>
                          <Input
                            id={`${line.id}_notes`}
                            value={state.notes}
                            onChange={(e) => handleLineUpdate(line.id, { notes: e.target.value })}
                            placeholder="Explain the discrepancy..."
                            className="text-xs"
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Receiving notes */}
          <div className="space-y-2">
            <Label htmlFor="receivingNotes">Receiving Notes (Optional)</Label>
            <Textarea
              id="receivingNotes"
              value={receivingNotes}
              onChange={(e) => setReceivingNotes(e.target.value)}
              placeholder="Add any receiving notes..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Processing..." : "Confirm Receipt"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
