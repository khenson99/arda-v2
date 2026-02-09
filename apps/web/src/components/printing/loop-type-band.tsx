// ─── Loop Type Band ──────────────────────────────────────────────────
// A thin colored bar indicating the kanban loop type.
// Standard printers use color; thermal printers use line patterns.

import { cn } from '@/lib/utils';
import type { KanbanPrintData } from './types';

const BAND_COLORS: Record<KanbanPrintData['loopType'], string> = {
  procurement: 'bg-primary',           // Arda Orange
  production: 'bg-[hsl(var(--link))]', // Arda Blue
  transfer: 'bg-muted-foreground',     // Gray
};

// Thermal patterns replace color on monochrome printers
const THERMAL_CLASSES: Record<KanbanPrintData['loopType'], string> = {
  procurement: 'print-band-solid',
  production: 'print-band-dashed',
  transfer: 'print-band-dotted',
};

interface LoopTypeBandProps {
  loopType: KanbanPrintData['loopType'];
  variant?: 'card' | 'label';
  isThermal?: boolean;
}

export function LoopTypeBand({ loopType, variant = 'card', isThermal = false }: LoopTypeBandProps) {
  const heightClass = variant === 'card' ? 'h-1' : 'h-0.5';

  return (
    <div
      className={cn(
        'w-full rounded-t-sm',
        heightClass,
        isThermal ? THERMAL_CLASSES[loopType] : BAND_COLORS[loopType],
      )}
      aria-label={`${loopType} loop type indicator`}
    />
  );
}
