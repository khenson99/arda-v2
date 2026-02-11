/**
 * TOShipModal — Mark transfer order as shipped
 *
 * Displays line items for reference and transitions the transfer order
 * to "in_transit" status with optional tracking number and notes.
 */

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { TruckIcon, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { isUnauthorized, parseApiError, updateTransferOrderStatus } from "@/lib/api-client";
import type { TransferOrder } from "@/types";

// ─── Props ───────────────────────────────────────────────────────────

export interface TOShipModalProps {
  open: boolean;
  onClose: () => void;
  transferOrder: TransferOrder;
  token: string;
  onShipped: () => void;
  onUnauthorized: () => void;
}

// ─── Component ───────────────────────────────────────────────────────

export function TOShipModal({
  open,
  onClose,
  transferOrder,
  token,
  onShipped,
  onUnauthorized,
}: TOShipModalProps) {
  const [trackingNumber, setTrackingNumber] = React.useState("");
  const [shippingNotes, setShippingNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTrackingNumber("");
      setShippingNotes("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Check that there are lines with remaining quantity to ship
    const hasRemainingQuantity = transferOrder.lines?.some(
      (line) => line.quantityRequested - line.quantityShipped > 0
    );
    if (!hasRemainingQuantity) {
      setError("No remaining quantity to ship on this transfer order");
      return;
    }

    setSubmitting(true);
    try {
      const notes = [
        shippingNotes,
        trackingNumber ? `Tracking: ${trackingNumber}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      // Transition to "shipped" or "in_transit" depending on backend logic
      // For now, we'll use "in_transit" as that's a common next step
      await updateTransferOrderStatus(token, transferOrder.id, {
        status: "in_transit",
        reason: notes || "Marked as shipped from UI",
      });

      toast.success("Transfer order marked as shipped");
      onShipped();
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TruckIcon className="h-5 w-5" />
            Ship Transfer Order
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

          {/* Line items summary */}
          <div className="space-y-2">
            <Label>Items to Ship</Label>
            <div className="space-y-2">
              {transferOrder.lines?.map((line) => {
                const remaining = line.quantityRequested - line.quantityShipped;
                return (
                  <Card key={line.id} className="rounded-lg">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{line.partName ?? line.partId}</p>
                          <p className="text-xs text-muted-foreground">
                            Requested: {line.quantityRequested} | Already Shipped: {line.quantityShipped}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{remaining}</p>
                          <p className="text-xs text-muted-foreground">to ship</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Tracking number */}
          <div className="space-y-2">
            <Label htmlFor="trackingNumber">Tracking Number (Optional)</Label>
            <Input
              id="trackingNumber"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Enter tracking number..."
            />
          </div>

          {/* Shipping notes */}
          <div className="space-y-2">
            <Label htmlFor="shippingNotes">Shipping Notes (Optional)</Label>
            <Textarea
              id="shippingNotes"
              value={shippingNotes}
              onChange={(e) => setShippingNotes(e.target.value)}
              placeholder="Add any shipping notes..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Processing..." : "Mark as Shipped"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
