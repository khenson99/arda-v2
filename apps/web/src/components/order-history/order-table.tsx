import { Skeleton } from "@/components/ui";
import { OrderStatusBadge, OrderTypeBadge } from "./order-status-badge";
import type { UnifiedOrder } from "@/types";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Package,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui";

/* ── Helpers ─────────────────────────────────────────────────── */

function formatCurrency(amount: number | null, currency = "USD"): string {
  if (amount === null || amount === undefined) return "\u2014";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function formatRelativeDate(date: string | null): string {
  if (!date) return "\u2014";
  const ms = Date.now() - new Date(date).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 0) {
    const absDays = Math.abs(days);
    if (absDays === 0) return "Today";
    if (absDays === 1) return "Tomorrow";
    if (absDays < 7) return `in ${absDays}d`;
    return new Date(date).toLocaleDateString();
  }
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(date).toLocaleDateString();
}

/* ── Props ───────────────────────────────────────────────────── */

interface OrderTableProps {
  orders: UnifiedOrder[];
  loading: boolean;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  onRowClick: (order: UnifiedOrder) => void;
  onPageChange: (page: number) => void;
}

/* ── Loading skeleton ────────────────────────────────────────── */

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-3 mb-3">
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">No orders found</p>
      <p className="text-xs text-muted-foreground mt-1">
        Adjust your filters or check back later.
      </p>
    </div>
  );
}

/* ── Component ──────────────────────────────────────────────── */

export function OrderTable({
  orders,
  loading,
  pagination,
  onRowClick,
  onPageChange,
}: OrderTableProps) {
  if (loading) return <TableSkeleton />;
  if (orders.length === 0) return <EmptyState />;

  return (
    <div>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted text-left">
              <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                Order #
              </th>
              <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                Source
              </th>
              <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wider text-right">
                Amount
              </th>
              <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                Created
              </th>
              <th className="px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                Expected
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order) => (
              <tr
                key={`${order.type}-${order.id}`}
                onClick={() => onRowClick(order)}
                className="hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-[hsl(var(--link))]">
                      {order.orderNumber}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <OrderTypeBadge type={order.type} />
                </td>
                <td className="px-4 py-3">
                  <OrderStatusBadge status={order.status} type={order.type} />
                </td>
                <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                  {order.sourceName ?? "\u2014"}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {formatCurrency(order.totalAmount, order.currency)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatRelativeDate(order.createdAt)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatRelativeDate(order.expectedDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}
            {"\u2013"}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
            {pagination.total} orders
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (pagination.totalPages <= 5) {
                pageNum = i + 1;
              } else if (pagination.page <= 3) {
                pageNum = i + 1;
              } else if (pagination.page >= pagination.totalPages - 2) {
                pageNum = pagination.totalPages - 4 + i;
              } else {
                pageNum = pagination.page - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === pagination.page ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                  className={cn(
                    "h-8 w-8 p-0 text-xs",
                    pageNum === pagination.page && "pointer-events-none",
                  )}
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
