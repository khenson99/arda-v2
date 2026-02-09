// ─── Kanban Card Template ────────────────────────────────────────────
// Renders a full kanban card for standard printer formats:
// 3x5_card, 4x6_card, business_card.

import { cn } from '@/lib/utils';
import type { PrintTemplateProps } from './types';
import { LoopTypeBand } from './loop-type-band';
import { StageBadgePrint } from './stage-badge-print';
import { TenantLogo } from './tenant-logo';

function FieldRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number | undefined;
  className?: string;
}) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className={cn('flex gap-1 leading-tight', className)}>
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function KanbanCardTemplate({ data, format, config }: PrintTemplateProps) {
  const isBusinessCard = format === 'business_card';
  const is4x6 = format === '4x6_card';

  // Dynamic font sizes based on format
  const partNumberSize = isBusinessCard ? 'text-[11px]' : 'text-[14px]';
  const descriptionSize = isBusinessCard ? 'text-[10px]' : 'text-[12px]';
  const fieldSize = isBusinessCard ? 'text-[9px]' : 'text-[10px]';
  const footerSize = 'text-[9px]';

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
      <LoopTypeBand loopType={data.loopType} variant="card" />

      {/* Header: Logo + QR */}
      <div className="flex justify-between items-start mt-1">
        <div className="flex-1 min-w-0">
          {config.showLogo && (
            <TenantLogo
              logoUrl={data.tenantLogoUrl}
              tenantName={data.tenantName}
              variant={isBusinessCard ? 'business_card' : 'card'}
            />
          )}

          {/* Part Number */}
          <div className={cn('font-bold mt-1 truncate', partNumberSize)}>
            {data.partNumber}
          </div>

          {/* Part Description */}
          {config.showDescription && (
            <div className={cn('text-foreground line-clamp-2', descriptionSize)}>
              {data.partDescription}
            </div>
          )}
        </div>

        {/* QR Code */}
        <div className="shrink-0 flex flex-col items-center ml-2">
          <img
            src={data.qrCodeDataUrl}
            alt="QR Code"
            width={config.qrSizePx}
            height={config.qrSizePx}
            className="block"
          />
          {config.showScanUrl && (
            <span className="text-[7px] text-muted-foreground mt-0.5 max-w-[120px] truncate text-center">
              {data.scanUrl}
            </span>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className={cn('mt-1 space-y-0.5', fieldSize)}>
        <FieldRow label="Facility" value={data.facilityName} />
        <FieldRow label="Location" value={data.storageLocation} />

        {data.loopType === 'procurement' && data.supplierName && (
          <FieldRow label="Supplier" value={data.supplierName} />
        )}
        {data.loopType === 'transfer' && data.sourceFacilityName && (
          <FieldRow label="Source" value={data.sourceFacilityName} />
        )}

        <div className="flex gap-3">
          <FieldRow label="Order Qty" value={data.orderQuantity} />
          <FieldRow label="Min Qty" value={data.minQuantity} />
        </div>

        {/* Extended fields (4x6 only) */}
        {config.showExtendedFields && (
          <>
            <div className="flex gap-3">
              {data.statedLeadTimeDays !== undefined && (
                <FieldRow label="Lead Time" value={`${data.statedLeadTimeDays}d`} />
              )}
              {data.safetyStockDays !== undefined && (
                <FieldRow label="Safety Stock" value={`${data.safetyStockDays}d`} />
              )}
            </div>
          </>
        )}

        {config.showNotes && data.notes && (
          <div className="text-[9px] text-muted-foreground mt-1 line-clamp-2 italic">
            {data.notes}
          </div>
        )}
      </div>

      {/* Footer: Card X of Y + Stage Badge */}
      <div className={cn('absolute bottom-1 left-3 right-3 flex justify-between items-center', footerSize)}>
        <span className="text-muted-foreground">
          Card {data.cardNumber} of {data.totalCards}
        </span>
        <StageBadgePrint stage={data.currentStage} />
      </div>

      {/* Arda Watermark */}
      {data.showArdaWatermark && (
        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[6px] text-muted-foreground/40">
          arda.cards
        </div>
      )}
    </div>
  );
}
