/**
 * SupplierGradeBadge — Visual indicator for supplier performance grade
 *
 * Renders a compact badge showing the supplier's letter grade (A-D or N/A)
 * with color coding. Can optionally display the on-time delivery rate
 * and a tooltip summary.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { SupplierGrade, SupplierPerformanceSummary } from './types';

// ─── Grade Styling ───────────────────────────────────────────────────

const gradeColors: Record<SupplierGrade, { bg: string; text: string; ring: string }> = {
  A: { bg: 'bg-green-100', text: 'text-green-800', ring: 'ring-green-300' },
  B: { bg: 'bg-blue-100', text: 'text-blue-800', ring: 'ring-blue-300' },
  C: { bg: 'bg-amber-100', text: 'text-amber-800', ring: 'ring-amber-300' },
  D: { bg: 'bg-red-100', text: 'text-red-800', ring: 'ring-red-300' },
  'N/A': { bg: 'bg-gray-100', text: 'text-gray-500', ring: 'ring-gray-300' },
};

// ─── Components ──────────────────────────────────────────────────────

export interface SupplierGradeBadgeProps {
  grade: SupplierGrade;
  /** Show the grade as a larger display (for detail views). */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SupplierGradeBadge({
  grade,
  size = 'sm',
  className,
}: SupplierGradeBadgeProps) {
  const colors = gradeColors[grade];

  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-12 w-12 text-lg',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold ring-1',
        colors.bg,
        colors.text,
        colors.ring,
        sizeClasses[size],
        className
      )}
      title={`Supplier Grade: ${grade}`}
    >
      {grade}
    </div>
  );
}

// ─── Supplier Performance Summary Card ───────────────────────────────

export interface SupplierPerformanceIndicatorProps {
  performance: SupplierPerformanceSummary;
  onViewSupplier?: (supplierId: string) => void;
  compact?: boolean;
}

export function SupplierPerformanceIndicator({
  performance,
  onViewSupplier,
  compact = false,
}: SupplierPerformanceIndicatorProps) {
  const p = performance;

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2">
        <SupplierGradeBadge grade={p.grade} size="sm" />
        {onViewSupplier ? (
          <button
            type="button"
            className="text-sm font-semibold text-[hsl(var(--link))] hover:underline"
            onClick={() => onViewSupplier(p.supplierId)}
          >
            {p.supplierName}
          </button>
        ) : (
          <span className="text-sm font-semibold">{p.supplierName}</span>
        )}
        {p.onTimeDeliveryRate !== null && (
          <span className="text-xs text-muted-foreground">
            {p.onTimeDeliveryRate.toFixed(0)}% OTD
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <SupplierGradeBadge grade={p.grade} size="lg" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {onViewSupplier ? (
            <button
              type="button"
              className="text-sm font-semibold text-[hsl(var(--link))] hover:underline truncate"
              onClick={() => onViewSupplier(p.supplierId)}
            >
              {p.supplierName}
            </button>
          ) : (
            <span className="text-sm font-semibold truncate">{p.supplierName}</span>
          )}
        </div>

        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
          <div className="name-value-pair">
            <span className="text-muted-foreground">OTD:</span>{' '}
            <span className={cn('font-semibold', getOTDColor(p.onTimeDeliveryRate))}>
              {p.onTimeDeliveryRate !== null ? `${p.onTimeDeliveryRate.toFixed(1)}%` : '--'}
            </span>
          </div>

          <div className="name-value-pair">
            <span className="text-muted-foreground">Avg Lead Time:</span>{' '}
            <span className="font-semibold">
              {p.avgLeadTimeDays !== null ? `${p.avgLeadTimeDays.toFixed(1)}d` : '--'}
            </span>
          </div>

          <div className="name-value-pair">
            <span className="text-muted-foreground">Variance:</span>{' '}
            <span
              className={cn(
                'font-semibold',
                p.avgLeadTimeVarianceDays !== null &&
                  (p.avgLeadTimeVarianceDays > 0 ? 'text-red-600' : 'text-green-600')
              )}
            >
              {p.avgLeadTimeVarianceDays !== null
                ? `${p.avgLeadTimeVarianceDays > 0 ? '+' : ''}${p.avgLeadTimeVarianceDays.toFixed(1)}d`
                : '--'}
            </span>
          </div>

          <div className="name-value-pair">
            <span className="text-muted-foreground">Quality:</span>{' '}
            <span className="font-semibold">
              {p.qualityRate !== null ? `${p.qualityRate.toFixed(1)}%` : '--'}
            </span>
          </div>
        </div>

        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{p.completedPOs} completed POs</span>
          <span>{p.activePOs} active</span>
          <span>{p.partCount} parts</span>
          {p.statedLeadTimeDays !== null && (
            <span>Stated: {p.statedLeadTimeDays}d</span>
          )}
        </div>
      </div>
    </div>
  );
}

function getOTDColor(rate: number | null): string {
  if (rate === null) return '';
  if (rate >= 95) return 'text-green-600';
  if (rate >= 85) return 'text-blue-600';
  if (rate >= 70) return 'text-amber-600';
  return 'text-red-600';
}
