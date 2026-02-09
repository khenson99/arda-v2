// ─── Kanban Label Template ───────────────────────────────────────────
// Renders a compact kanban label for thermal printer formats:
// business_label, 1x3_label, bin_label, 1x1_label.

import { cn } from '@/lib/utils';
import type { PrintTemplateProps } from './types';
import { LoopTypeBand } from './loop-type-band';
import { StageBadgePrint } from './stage-badge-print';

// ─── QR-Only Label (1x1) ────────────────────────────────────────────
function QrOnlyLabel({ data, config }: Pick<PrintTemplateProps, 'data' | 'config'>) {
  return (
    <div
      className="print-card flex items-center justify-center border border-border bg-white"
      style={{
        width: config.widthPx,
        height: config.heightPx,
        padding: config.safeInsetPx,
      }}
    >
      <img
        src={data.qrCodeDataUrl}
        alt="QR Code"
        width={config.qrSizePx}
        height={config.qrSizePx}
        className="block"
      />
    </div>
  );
}

export function KanbanLabelTemplate({ data, format, config }: PrintTemplateProps) {
  // 1x1_label is QR-only
  if (format === '1x1_label') {
    return <QrOnlyLabel data={data} config={config} />;
  }

  const isBinLabel = format === 'bin_label';
  const textSize = 'text-[9px]';
  const partNumberSize = 'text-[11px]';

  return (
    <div
      className="print-card relative overflow-hidden border border-border bg-white"
      style={{
        width: config.widthPx,
        height: config.heightPx,
        padding: config.safeInsetPx,
      }}
    >
      {/* Loop Type Band */}
      <LoopTypeBand loopType={data.loopType} variant="label" isThermal />

      {/* Content: QR left, text right */}
      <div className="flex gap-2 mt-0.5 h-full">
        {/* QR Code */}
        <div className="shrink-0 flex items-start">
          <img
            src={data.qrCodeDataUrl}
            alt="QR Code"
            width={config.qrSizePx}
            height={config.qrSizePx}
            className="block"
          />
        </div>

        {/* Text Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            {/* Part Number */}
            <div className={cn('font-bold truncate', partNumberSize)}>
              {data.partNumber}
            </div>

            {/* Part Description (if shown for this format) */}
            {config.showDescription && (
              <div className={cn('text-foreground truncate', textSize)}>
                {data.partDescription}
              </div>
            )}
          </div>

          {/* Bottom row: Qty + Card X of Y + optional stage badge */}
          <div className={cn('flex items-center gap-2', textSize)}>
            {!isBinLabel && (
              <span className="text-muted-foreground">
                Qty: {data.orderQuantity}
              </span>
            )}
            <span className="text-muted-foreground">
              {data.cardNumber}/{data.totalCards}
            </span>
            {!isBinLabel && <StageBadgePrint stage={data.currentStage} />}
          </div>
        </div>
      </div>
    </div>
  );
}
