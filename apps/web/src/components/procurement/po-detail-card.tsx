/**
 * PODetailCard — Purchase Order detail view
 *
 * Displays a complete purchase order with header info, status timeline,
 * line items table, and action buttons. Follows Arda design system:
 * Card with card-arda blue accent bar, name-value pairs, table styles.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PurchaseOrder, POStatus } from './types';

// ─── Status Configuration ────────────────────────────────────────────

const statusConfig: Record<
  POStatus,
  { variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'accent'; label: string }
> = {
  draft: { variant: 'secondary', label: 'Draft' },
  pending_approval: { variant: 'warning', label: 'Pending Approval' },
  approved: { variant: 'accent', label: 'Approved' },
  sent: { variant: 'accent', label: 'Sent' },
  acknowledged: { variant: 'accent', label: 'Acknowledged' },
  partially_received: { variant: 'warning', label: 'Partially Received' },
  received: { variant: 'success', label: 'Received' },
  closed: { variant: 'success', label: 'Closed' },
  cancelled: { variant: 'destructive', label: 'Cancelled' },
};

// PO status timeline order
const STATUS_ORDER: POStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'acknowledged',
  'partially_received',
  'received',
  'closed',
];

// ─── Component ───────────────────────────────────────────────────────

export interface PODetailCardProps {
  po: PurchaseOrder;
  onApprove?: (poId: string) => void;
  onSend?: (poId: string) => void;
  onCancel?: (poId: string) => void;
  onClose?: (poId: string) => void;
  onViewSupplier?: (supplierId: string) => void;
  onViewPart?: (partId: string) => void;
}

export function PODetailCard({
  po,
  onApprove,
  onSend,
  onCancel,
  onClose,
  onViewSupplier,
  onViewPart,
}: PODetailCardProps) {
  const config = statusConfig[po.status];
  const statusIdx = STATUS_ORDER.indexOf(po.status);
  const isCancelled = po.status === 'cancelled';
  const isTerminal = po.status === 'closed' || isCancelled;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: po.currency,
    }).format(amount);
  };

  return (
    <Card className="card-arda">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{po.poNumber}</CardTitle>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={config.variant}>{config.label}</Badge>
              <span className="text-xs text-muted-foreground">
                Created {formatDate(po.createdAt)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{formatCurrency(po.totalAmount)}</div>
            <div className="text-xs text-muted-foreground">{po.currency}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Timeline */}
        {!isCancelled && (
          <div className="flex items-center gap-1">
            {STATUS_ORDER.map((status, idx) => {
              const isReached = idx <= statusIdx;
              const isCurrent = idx === statusIdx;
              return (
                <React.Fragment key={status}>
                  <div
                    className={cn(
                      'h-2 flex-1 rounded-full transition-colors',
                      isReached ? 'bg-primary' : 'bg-muted',
                      isCurrent && 'bg-primary ring-2 ring-primary/30'
                    )}
                    title={statusConfig[status].label}
                  />
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Order Info Grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="name-value-pair">
            <span className="text-muted-foreground">Supplier:</span>{' '}
            {onViewSupplier ? (
              <button
                type="button"
                className="font-semibold text-[hsl(var(--link))] hover:underline"
                onClick={() => onViewSupplier(po.supplierId)}
              >
                {po.supplierName}
              </button>
            ) : (
              <span className="font-semibold">{po.supplierName}</span>
            )}
          </div>

          <div className="name-value-pair">
            <span className="text-muted-foreground">Facility:</span>{' '}
            <span className="font-semibold">{po.facilityName}</span>
          </div>

          <div className="name-value-pair">
            <span className="text-muted-foreground">Order Date:</span>{' '}
            <span className="font-semibold">{formatDate(po.orderDate)}</span>
          </div>

          <div className="name-value-pair">
            <span className="text-muted-foreground">Expected Delivery:</span>{' '}
            <span className="font-semibold">{formatDate(po.expectedDeliveryDate)}</span>
          </div>

          {po.sentAt && (
            <div className="name-value-pair">
              <span className="text-muted-foreground">Sent:</span>{' '}
              <span className="font-semibold">{formatDate(po.sentAt)}</span>
            </div>
          )}

          {po.actualDeliveryDate && (
            <div className="name-value-pair">
              <span className="text-muted-foreground">Delivered:</span>{' '}
              <span className="font-semibold">{formatDate(po.actualDeliveryDate)}</span>
            </div>
          )}
        </div>

        {/* Line Items Table */}
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Part</th>
                <th className="px-3 py-2 text-right font-medium">Ordered</th>
                <th className="px-3 py-2 text-right font-medium">Received</th>
                <th className="px-3 py-2 text-right font-medium">Unit Cost</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((line) => (
                <tr key={line.id} className="border-t hover:bg-muted/50">
                  <td className="px-3 py-2 text-muted-foreground">{line.lineNumber}</td>
                  <td className="px-3 py-2">
                    {onViewPart ? (
                      <button
                        type="button"
                        className="text-[hsl(var(--link))] hover:underline font-medium"
                        onClick={() => onViewPart(line.partId)}
                      >
                        {line.partNumber}
                      </button>
                    ) : (
                      <span className="font-medium">{line.partNumber}</span>
                    )}
                    <span className="ml-2 text-muted-foreground">{line.partName}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{line.quantityOrdered}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={cn(
                        line.quantityReceived >= line.quantityOrdered
                          ? 'text-green-600'
                          : line.quantityReceived > 0
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                      )}
                    >
                      {line.quantityReceived}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(line.unitCost)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50">
                <td colSpan={5} className="px-3 py-2 text-right font-semibold">
                  Total
                </td>
                <td className="px-3 py-2 text-right font-bold">
                  {formatCurrency(po.totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes */}
        {po.notes && (
          <div className="text-sm">
            <span className="text-muted-foreground">Notes:</span>{' '}
            <span>{po.notes}</span>
          </div>
        )}

        {/* Action Buttons */}
        {!isTerminal && (
          <div className="flex items-center gap-2 pt-2 border-t">
            {po.status === 'pending_approval' && onApprove && (
              <Button size="sm" onClick={() => onApprove(po.id)}>
                Approve
              </Button>
            )}
            {po.status === 'approved' && onSend && (
              <Button size="sm" variant="accent" onClick={() => onSend(po.id)}>
                Send to Supplier
              </Button>
            )}
            {po.status === 'received' && onClose && (
              <Button size="sm" variant="outline" onClick={() => onClose(po.id)}>
                Close PO
              </Button>
            )}
            {onCancel && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-muted-foreground"
                onClick={() => onCancel(po.id)}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
