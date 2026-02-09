/**
 * QueueItemCard — Individual queue item display
 *
 * Renders a single Kanban card from the procurement queue with
 * criticality indicator, priority score, and key part/supplier info.
 * Follows Arda design system: rounded-xl, shadow-sm, name-value pairs.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { QueueItem, CriticalityLevel } from './types';

// ─── Criticality Mapping ─────────────────────────────────────────────

const criticalityConfig: Record<
  CriticalityLevel,
  { variant: 'destructive' | 'warning' | 'accent' | 'secondary'; dot: string; label: string }
> = {
  critical: { variant: 'destructive', dot: 'bg-red-500', label: 'Critical' },
  high: { variant: 'warning', dot: 'bg-amber-500', label: 'High' },
  medium: { variant: 'accent', dot: 'bg-blue-500', label: 'Medium' },
  low: { variant: 'secondary', dot: 'bg-gray-400', label: 'Low' },
};

// ─── Component ───────────────────────────────────────────────────────

export interface QueueItemCardProps {
  item: QueueItem;
  selected?: boolean;
  onSelect?: (cardId: string) => void;
  onViewSupplier?: (supplierId: string) => void;
  onViewPart?: (partId: string) => void;
}

export function QueueItemCard({
  item,
  selected = false,
  onSelect,
  onViewSupplier,
  onViewPart,
}: QueueItemCardProps) {
  const config = criticalityConfig[item.criticality];
  const isDaysOfSupplyLow =
    item.daysOfSupply !== null && item.daysOfSupply <= item.safetyStockDays;

  return (
    <Card
      className={cn(
        'px-4 py-3 transition-colors cursor-pointer',
        selected && 'ring-2 ring-primary/50 bg-primary/5',
        !selected && 'hover:bg-muted/50'
      )}
      onClick={() => onSelect?.(item.cardId)}
    >
      <div className="flex items-start gap-3">
        {/* Selection checkbox */}
        <div className="flex items-center pt-0.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(item.cardId)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Criticality dot */}
        <div className="flex items-center pt-1">
          <span className={cn('h-2.5 w-2.5 rounded-full', config.dot)} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top row: part info + badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                className="text-sm font-semibold text-[hsl(var(--link))] hover:underline truncate"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewPart?.(item.partId);
                }}
              >
                {item.partNumber}
              </button>
              <span className="text-sm text-muted-foreground truncate">
                {item.partName}
              </span>
            </div>
            <Badge variant={config.variant} className="shrink-0">
              {config.label}
            </Badge>
          </div>

          {/* Detail row */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="name-value-pair">
              <span className="text-muted-foreground">Qty:</span>{' '}
              <span className="font-semibold">{item.orderQuantity}</span>
            </span>

            <span className="name-value-pair">
              <span className="text-muted-foreground">Value:</span>{' '}
              <span className="font-semibold">
                ${item.estimatedLineValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </span>

            <span className="name-value-pair">
              <span className="text-muted-foreground">Age:</span>{' '}
              <span className="font-semibold">
                {item.ageHours < 24
                  ? `${Math.round(item.ageHours)}h`
                  : `${Math.round(item.ageHours / 24)}d`}
              </span>
            </span>

            {item.daysOfSupply !== null && (
              <span className="name-value-pair">
                <span className="text-muted-foreground">DoS:</span>{' '}
                <span
                  className={cn(
                    'font-semibold',
                    isDaysOfSupplyLow && 'text-red-600'
                  )}
                >
                  {item.daysOfSupply.toFixed(1)}d
                </span>
              </span>
            )}

            <span className="name-value-pair">
              <span className="text-muted-foreground">Score:</span>{' '}
              <span className="font-semibold">{item.priorityScore.toFixed(1)}</span>
            </span>
          </div>

          {/* Bottom row: supplier + facility */}
          <div className="mt-1 flex items-center gap-x-4 text-xs">
            {item.supplierName && (
              <span className="name-value-pair">
                <span className="text-muted-foreground">Supplier:</span>{' '}
                {item.supplierId && onViewSupplier ? (
                  <button
                    type="button"
                    className="font-semibold text-[hsl(var(--link))] hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewSupplier(item.supplierId!);
                    }}
                  >
                    {item.supplierName}
                  </button>
                ) : (
                  <span className="font-semibold">{item.supplierName}</span>
                )}
              </span>
            )}
            <span className="name-value-pair">
              <span className="text-muted-foreground">Facility:</span>{' '}
              <span className="font-semibold">{item.facilityName}</span>
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
