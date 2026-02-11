import { Badge } from "@/components/ui";
import { PO_STATUS_META } from "@/types";
import type { POStatus, WOStatus, TOStatus, OrderType } from "@/types";
import { cn } from "@/lib/utils";

/* ── Work Order status meta ─────────────────────────────────── */

const WO_STATUS_META: Record<WOStatus, { label: string; colorClass: string }> = {
  draft: { label: "Draft", colorClass: "bg-gray-100 text-gray-700 border-gray-200" },
  scheduled: { label: "Scheduled", colorClass: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress: { label: "In Progress", colorClass: "bg-blue-50 text-blue-700 border-blue-200" },
  completed: { label: "Completed", colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", colorClass: "bg-red-50 text-red-700 border-red-200" },
};

/* ── Transfer Order status meta ─────────────────────────────── */

const TO_STATUS_META: Record<TOStatus, { label: string; colorClass: string }> = {
  draft: { label: "Draft", colorClass: "bg-gray-100 text-gray-700 border-gray-200" },
  requested: { label: "Requested", colorClass: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved", colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  picking: { label: "Picking", colorClass: "bg-violet-50 text-violet-700 border-violet-200" },
  shipped: { label: "Shipped", colorClass: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  in_transit: { label: "In Transit", colorClass: "bg-blue-50 text-blue-700 border-blue-200" },
  received: { label: "Received", colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  closed: { label: "Closed", colorClass: "bg-gray-100 text-gray-700 border-gray-200" },
  cancelled: { label: "Cancelled", colorClass: "bg-red-50 text-red-700 border-red-200" },
};

/* ── PO status → tailwind color ─────────────────────────────── */

const PO_STATUS_COLORS: Record<POStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  acknowledged: "bg-blue-50 text-blue-700 border-blue-200",
  partially_received: "bg-amber-50 text-amber-700 border-amber-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-gray-100 text-gray-700 border-gray-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

/* ── Component ──────────────────────────────────────────────── */

interface OrderStatusBadgeProps {
  status: string;
  type: OrderType;
  className?: string;
}

export function OrderStatusBadge({ status, type, className }: OrderStatusBadgeProps) {
  let label: string;
  let colorClass: string;

  if (type === "purchase") {
    const meta = PO_STATUS_META[status as POStatus];
    label = meta?.label ?? status;
    colorClass = PO_STATUS_COLORS[status as POStatus] ?? "bg-gray-100 text-gray-700 border-gray-200";
  } else if (type === "work") {
    const meta = WO_STATUS_META[status as WOStatus];
    label = meta?.label ?? status;
    colorClass = meta?.colorClass ?? "bg-gray-100 text-gray-700 border-gray-200";
  } else {
    const meta = TO_STATUS_META[status as TOStatus];
    label = meta?.label ?? status;
    colorClass = meta?.colorClass ?? "bg-gray-100 text-gray-700 border-gray-200";
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "border font-medium text-xs",
        colorClass,
        className,
      )}
    >
      {label}
    </Badge>
  );
}

/* ── Order type badge ───────────────────────────────────────── */

const ORDER_TYPE_META: Record<OrderType, { label: string; colorClass: string }> = {
  purchase: { label: "Purchase", colorClass: "bg-blue-50 text-blue-700 border-blue-200" },
  work: { label: "Work", colorClass: "bg-violet-50 text-violet-700 border-violet-200" },
  transfer: { label: "Transfer", colorClass: "bg-amber-50 text-amber-700 border-amber-200" },
};

interface OrderTypeBadgeProps {
  type: OrderType;
  className?: string;
}

export function OrderTypeBadge({ type, className }: OrderTypeBadgeProps) {
  const meta = ORDER_TYPE_META[type];

  return (
    <Badge
      variant="outline"
      className={cn(
        "border font-medium text-xs",
        meta.colorClass,
        className,
      )}
    >
      {meta.label}
    </Badge>
  );
}
