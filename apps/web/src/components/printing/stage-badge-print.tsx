// ─── Stage Badge (Print Version) ─────────────────────────────────────
// Compact badge for printing. Uses 10% opacity backgrounds matching
// the stage color for readability on both screen and print.

import { cn } from '@/lib/utils';
import type { KanbanPrintData } from './types';
import { STAGE_LABELS } from './types';

const STAGE_STYLES: Record<KanbanPrintData['currentStage'], string> = {
  created: 'bg-blue-100 text-blue-700',
  triggered: 'bg-orange-100 text-orange-700',
  ordered: 'bg-purple-100 text-purple-700',
  in_transit: 'bg-cyan-100 text-cyan-700',
  received: 'bg-green-100 text-green-700',
  restocked: 'bg-gray-100 text-gray-600',
};

interface StageBadgePrintProps {
  stage: KanbanPrintData['currentStage'];
  className?: string;
}

export function StageBadgePrint({ stage, className }: StageBadgePrintProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5',
        'text-[8px] font-semibold leading-none',
        STAGE_STYLES[stage],
        className,
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
