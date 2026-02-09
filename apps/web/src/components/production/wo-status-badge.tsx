/**
 * WOStatusBadge — Work Order status indicator
 *
 * Renders a badge with appropriate color for each WO lifecycle status.
 * Follows Arda design system badge variants with 10% opacity backgrounds.
 */

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WOStatus, WOHoldReason } from './types';

// ─── Status Config ──────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'accent' | 'outline';
  dot: string;
}

const statusConfig: Record<WOStatus, StatusConfig> = {
  draft: { label: 'Draft', variant: 'secondary', dot: 'bg-gray-400' },
  scheduled: { label: 'Scheduled', variant: 'accent', dot: 'bg-blue-500' },
  in_progress: { label: 'In Progress', variant: 'success', dot: 'bg-emerald-500' },
  on_hold: { label: 'On Hold', variant: 'warning', dot: 'bg-amber-500' },
  completed: { label: 'Completed', variant: 'success', dot: 'bg-emerald-600' },
  cancelled: { label: 'Cancelled', variant: 'destructive', dot: 'bg-red-500' },
};

const holdReasonLabels: Record<WOHoldReason, string> = {
  material_shortage: 'Material Shortage',
  equipment_failure: 'Equipment Failure',
  quality_hold: 'Quality Hold',
  labor_unavailable: 'Labor Unavailable',
  other: 'Other',
};

// ─── Component ──────────────────────────────────────────────────────

export interface WOStatusBadgeProps {
  status: WOStatus;
  holdReason?: WOHoldReason | null;
  isExpedited?: boolean;
  showDot?: boolean;
  className?: string;
}

export function WOStatusBadge({
  status,
  holdReason,
  isExpedited,
  showDot = false,
  className,
}: WOStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {showDot && (
        <span className={cn('h-2 w-2 rounded-full shrink-0', config.dot)} />
      )}
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
      {isExpedited && (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          RUSH
        </Badge>
      )}
      {status === 'on_hold' && holdReason && (
        <span className="text-xs text-muted-foreground">
          ({holdReasonLabels[holdReason]})
        </span>
      )}
    </span>
  );
}

// ─── Step Status Badge ──────────────────────────────────────────────

import type { RoutingStepStatus } from './types';

const stepStatusConfig: Record<RoutingStepStatus, StatusConfig> = {
  pending: { label: 'Pending', variant: 'secondary', dot: 'bg-gray-400' },
  in_progress: { label: 'In Progress', variant: 'accent', dot: 'bg-blue-500' },
  complete: { label: 'Complete', variant: 'success', dot: 'bg-emerald-500' },
  on_hold: { label: 'On Hold', variant: 'warning', dot: 'bg-amber-500' },
  skipped: { label: 'Skipped', variant: 'outline', dot: 'bg-gray-300' },
};

export interface StepStatusBadgeProps {
  status: RoutingStepStatus;
  className?: string;
}

export function StepStatusBadge({ status, className }: StepStatusBadgeProps) {
  const config = stepStatusConfig[status];
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
