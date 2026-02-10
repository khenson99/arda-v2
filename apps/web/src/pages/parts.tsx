import * as React from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Loader2,
  MessageSquare,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { EditableCell, PaginationBar, ColumnConfig, BulkActionsBar, ItemCardList } from "@/components/data-table";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ErrorBanner } from "@/components/error-banner";
import { NextActionBanner } from "@/components/next-action-banner";
import { useWorkspaceData } from "@/hooks/use-workspace-data";
import {
  createPrintJob,
  createPurchaseOrderFromCards,
  fetchLoops,
  isUnauthorized,
  normalizeOptionalString,
  parseApiError,
  toItemsInputPayload,
  updateLoopParameters,
  updateItemRecord,
} from "@/lib/api-client";
import {
  formatDateTime,
  formatMoney,
  formatNumericValue,
  formatReadableLabel,
  formatStatus,
} from "@/lib/formatters";
import { ITEMS_PAGE_SIZE_STORAGE_KEY, ITEMS_VISIBLE_COLUMNS_STORAGE_KEY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AuthSession, InlineEditableField, ItemTableColumnKey, KanbanLoop, LoopType, PartRecord } from "@/types";
import {
  ITEMS_PAGE_SIZE_OPTIONS,
  ITEM_TABLE_COLUMNS,
  ITEM_TABLE_COLUMN_KEYS,
  ITEM_TABLE_DEFAULT_VISIBLE_COLUMNS,
  LOOP_META,
  LOOP_ORDER,
} from "@/types";

/* ── Inline edit commit factory ─────────────────────────────── */

function buildCommitHandler(
  part: PartRecord,
  field: InlineEditableField,
  session: AuthSession,
  onOptimisticUpdate: (partId: string, patch: Partial<PartRecord>) => void,
): (nextValue: string) => Promise<void> {
  return async (nextValue: string) => {
    const rawValue = nextValue.trim();
    const payloadPatch: Partial<import("@/types").ItemsServiceInputPayload> = {};
    const localPatch: Partial<PartRecord> = {};

    if (field === "supplier") {
      if (!rawValue) throw new Error("Supplier is required.");
      payloadPatch.primarySupplier = rawValue;
      localPatch.primarySupplier = rawValue;
    }

    if (field === "orderQuantity") {
      if (!rawValue) {
        payloadPatch.orderQty = null;
        localPatch.orderQty = null;
      } else {
        const parsed = Number.parseInt(rawValue, 10);
        if (!Number.isFinite(parsed) || parsed < 0)
          throw new Error("Order quantity must be a whole number >= 0.");
        payloadPatch.orderQty = parsed;
        localPatch.orderQty = parsed;
      }
    }

    if (field === "orderUnits") {
      const normalized = normalizeOptionalString(rawValue);
      payloadPatch.orderQtyUnit = normalized;
      localPatch.orderQtyUnit = normalized;
    }

    if (field === "minQuantity") {
      if (!rawValue) throw new Error("Min quantity is required.");
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsed) || parsed < 0)
        throw new Error("Min quantity must be a whole number >= 0.");
      payloadPatch.minQty = parsed;
      localPatch.minQty = parsed;
    }

    if (field === "minUnits") {
      if (!rawValue) throw new Error("Min units is required.");
      payloadPatch.minQtyUnit = rawValue;
      localPatch.minQtyUnit = rawValue;
    }

    if (field === "orderMethod") {
      if (!rawValue) throw new Error("Order method is required.");
      payloadPatch.orderMechanism = rawValue;
      localPatch.orderMechanism = rawValue;
      localPatch.type = rawValue;
    }

    if (field === "location") {
      const normalized = normalizeOptionalString(rawValue);
      payloadPatch.location = normalized;
      localPatch.location = normalized;
    }

    const entityId = part.eId;
    if (!entityId) {
      throw new Error("Inline editing requires item IDs. Refresh and try again.");
    }

    const author = normalizeOptionalString(session.user.email) || session.user.id;
    const payload = {
      ...toItemsInputPayload(part),
      ...payloadPatch,
    };

    await updateItemRecord(session.tokens.accessToken, {
      entityId,
      tenantId: session.user.tenantId,
      author,
      payload,
    });

    // Optimistic local update on success
    onOptimisticUpdate(part.id, localPatch);
    toast.success(`${ITEM_TABLE_COLUMNS.find((c) => c.key === field)?.label ?? field} updated`);
  };
}

/* ── PartsRoute ─────────────────────────────────────────────── */

export function PartsRoute({
  session,
  onUnauthorized,
}: {
  session: AuthSession;
  onUnauthorized: () => void;
}) {
  const { isLoading, isRefreshing, error, queueSummary, queueByLoop, parts, partCount, orderLineByItem, refreshAll } =
    useWorkspaceData(session.tokens.accessToken, onUnauthorized);

  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [activeTab, setActiveTab] = React.useState<"published" | "recentlyImported">("published");
  const [pageSize, setPageSize] = React.useState<number>(() => {
    if (typeof window === "undefined") return 50;
    const raw = window.localStorage.getItem(ITEMS_PAGE_SIZE_STORAGE_KEY);
    const parsed = Number(raw);
    return ITEMS_PAGE_SIZE_OPTIONS.includes(parsed as (typeof ITEMS_PAGE_SIZE_OPTIONS)[number]) ? parsed : 50;
  });
  const [visibleColumns, setVisibleColumns] = React.useState<ItemTableColumnKey[]>(() => {
    if (typeof window === "undefined") {
      return [...ITEM_TABLE_DEFAULT_VISIBLE_COLUMNS];
    }

    const requiredColumns = new Set<ItemTableColumnKey>(
      ITEM_TABLE_COLUMNS.filter((column) => column.required).map((column) => column.key),
    );

    try {
      const raw = window.localStorage.getItem(ITEMS_VISIBLE_COLUMNS_STORAGE_KEY);
      if (!raw) {
        return [...ITEM_TABLE_DEFAULT_VISIBLE_COLUMNS];
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [...ITEM_TABLE_DEFAULT_VISIBLE_COLUMNS];
      }

      const nextVisible = new Set<ItemTableColumnKey>();
      for (const value of parsed) {
        if (typeof value !== "string") continue;
        if ((ITEM_TABLE_COLUMN_KEYS as readonly string[]).includes(value)) {
          nextVisible.add(value as ItemTableColumnKey);
        }
      }

      if (nextVisible.size === 0) {
        return [...ITEM_TABLE_DEFAULT_VISIBLE_COLUMNS];
      }

      for (const required of requiredColumns) {
        nextVisible.add(required);
      }

      return ITEM_TABLE_COLUMN_KEYS.filter((columnKey) =>
        nextVisible.has(columnKey as ItemTableColumnKey),
      ) as ItemTableColumnKey[];
    } catch {
      return [...ITEM_TABLE_DEFAULT_VISIBLE_COLUMNS];
    }
  });
  const [inlineOverrides, setInlineOverrides] = React.useState<Record<string, Partial<PartRecord>>>({});
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [itemDialogState, setItemDialogState] = React.useState<{
    open: boolean;
    mode: "create" | "edit";
    part: PartRecord | null;
  }>({
    open: false,
    mode: "edit",
    part: null,
  });
  const isMobile = useMediaQuery("(max-width: 767px)");

  const openCreateItemDialog = React.useCallback(() => {
    setItemDialogState({
      open: true,
      mode: "create",
      part: null,
    });
  }, []);

  const openItemDetailDialog = React.useCallback((part: PartRecord) => {
    setItemDialogState({
      open: true,
      mode: "edit",
      part,
    });
  }, []);

  // Persist page size + column config to localStorage
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ITEMS_PAGE_SIZE_STORAGE_KEY, String(pageSize));
  }, [pageSize]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ITEMS_VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // ── Derived data ─────────────────────────────────────────────

  const effectiveParts = React.useMemo(
    () =>
      parts.map((part) => ({
        ...part,
        ...(inlineOverrides[part.id] ?? {}),
      })),
    [inlineOverrides, parts],
  );

  const queueCards = React.useMemo(
    () => LOOP_ORDER.flatMap((loopType) => queueByLoop[loopType] ?? []),
    [queueByLoop],
  );

  const queueStatsByPartId = React.useMemo(() => {
    const stats = new Map<
      string,
      {
        cards: number;
        cardIds: string[];
        minUnits: number | null;
        orderUnits: number | null;
        queueUpdatedAt: string | null;
        latestStage: string | null;
        loopTypes: Set<LoopType>;
      }
    >();

    for (const card of queueCards) {
      const existing = stats.get(card.partId) ?? {
        cards: 0,
        cardIds: [],
        minUnits: null,
        orderUnits: null,
        queueUpdatedAt: null,
        latestStage: null,
        loopTypes: new Set<LoopType>(),
      };

      existing.cards += 1;
      existing.cardIds.push(card.id);
      existing.minUnits =
        existing.minUnits === null ? card.minQuantity : Math.max(existing.minUnits, card.minQuantity);
      existing.orderUnits =
        existing.orderUnits === null ? card.orderQuantity : Math.max(existing.orderUnits, card.orderQuantity);
      const isLatestCard = existing.queueUpdatedAt === null || card.currentStageEnteredAt > existing.queueUpdatedAt;
      if (isLatestCard) {
        existing.queueUpdatedAt = card.currentStageEnteredAt;
        existing.latestStage = card.currentStage;
      }
      existing.loopTypes.add(card.loopType);

      stats.set(card.partId, existing);
    }

    return stats;
  }, [queueCards]);

  const activeItemsCount = React.useMemo(
    () => effectiveParts.filter((part) => part.isActive).length,
    [effectiveParts],
  );
  const recentlyImportedCount = React.useMemo(
    () => effectiveParts.filter((part) => queueStatsByPartId.has(part.id)).length,
    [effectiveParts, queueStatsByPartId],
  );

  const scopedParts = React.useMemo(
    () =>
      activeTab === "recentlyImported"
        ? effectiveParts.filter((part) => queueStatsByPartId.has(part.id))
        : effectiveParts.filter((part) => part.isActive),
    [activeTab, effectiveParts, queueStatsByPartId],
  );

  const filteredParts = React.useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return scopedParts;

    return scopedParts.filter((part) => {
      const queueStats = queueStatsByPartId.get(part.id);
      const orderLineSummary = orderLineByItem[part.eId ?? part.id];
      const loopText = queueStats
        ? Array.from(queueStats.loopTypes)
            .map((loopType) => LOOP_META[loopType].label)
            .join(" ")
            .toLowerCase()
        : "";
      const orderStatusText = (orderLineSummary?.status ?? "").toLowerCase();

      return (
        part.partNumber.toLowerCase().includes(normalized) ||
        (part.externalGuid ?? "").toLowerCase().includes(normalized) ||
        part.name.toLowerCase().includes(normalized) ||
        (part.primarySupplier ?? "").toLowerCase().includes(normalized) ||
        (part.orderMechanism ?? "").toLowerCase().includes(normalized) ||
        (part.location ?? "").toLowerCase().includes(normalized) ||
        (part.glCode ?? "").toLowerCase().includes(normalized) ||
        (part.itemSubtype ?? "").toLowerCase().includes(normalized) ||
        orderStatusText.includes(normalized) ||
        part.type.toLowerCase().includes(normalized) ||
        loopText.includes(normalized)
      );
    });
  }, [orderLineByItem, queueStatsByPartId, scopedParts, search]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1);
  }, [activeTab, pageSize, search]);

  // Clear selection when page / tab / search changes
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab, pageSize, search, page]);

  const toggleOne = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Pagination math ──────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredParts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedParts = filteredParts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstVisibleIndex = pagedParts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastVisibleIndex = pagedParts.length === 0 ? 0 : (currentPage - 1) * pageSize + pagedParts.length;
  const visibleColumnsSet = React.useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const tableColumnCount = visibleColumns.length + 1;
  const tableMinWidth = Math.max(1280, 120 + visibleColumns.length * 138);

  const toggleAll = React.useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === pagedParts.length ? new Set() : new Set(pagedParts.map((p) => p.id)),
    );
  }, [pagedParts]);

  // Aggregate card IDs from selected parts for bulk actions
  const selectedCardIds = React.useMemo(() => {
    const ids: string[] = [];
    for (const partId of selectedIds) {
      const stats = queueStatsByPartId.get(partId);
      if (stats) ids.push(...stats.cardIds);
    }
    return ids;
  }, [selectedIds, queueStatsByPartId]);

  // ── Optimistic update handler ────────────────────────────────

  const applyOptimisticUpdate = React.useCallback((partId: string, patch: Partial<PartRecord>) => {
    setInlineOverrides((prev) => ({
      ...prev,
      [partId]: {
        ...(prev[partId] ?? {}),
        ...patch,
      },
    }));
  }, []);

  // ── Loading state ────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="density-compact space-y-2">
        {/* Header skeleton */}
        <div className="space-y-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Toolbar skeleton */}
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </CardContent>
        </Card>

        {/* Table skeleton */}
        <div className="rounded-xl border">
          <Skeleton className="h-10 w-full rounded-t-xl" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-t px-4 py-2.5">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="density-compact space-y-2">
      {error && <ErrorBanner message={error} onRetry={refreshAll} />}

      <NextActionBanner queueSummary={queueSummary} queueByLoop={queueByLoop} />

      <section className="space-y-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
            <span>Home</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">Items</span>
          </div>
          <h2 className="text-3xl leading-tight font-bold tracking-tight md:text-[40px] md:leading-[1.05]">
            Items
          </h2>
          <p className="text-sm text-muted-foreground">
            Create new items, print Kanban Cards, and add to order queue.
          </p>
        </div>

        {/* ── Tabs ──────────────────────────────────────────── */}

        <div role="tablist" className="flex items-center gap-5 border-b border-border/80">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "published"}
            aria-controls="panel-published"
            onClick={() => setActiveTab("published")}
            className={cn(
              "border-b-2 pb-1.5 text-base font-semibold transition-colors",
              activeTab === "published"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            Published Items
            <span className="ml-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {activeItemsCount}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "recentlyImported"}
            aria-controls="panel-recentlyImported"
            onClick={() => setActiveTab("recentlyImported")}
            className={cn(
              "border-b-2 pb-1.5 text-base font-medium transition-colors",
              activeTab === "recentlyImported"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            Recently Imported
            <span className="ml-1.5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              {recentlyImportedCount}
            </span>
          </button>
        </div>

        {/* ── Toolbar + Table (tabpanel) ─────────────────── */}

        <div role="tabpanel" id={`panel-${activeTab}`} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="relative w-[360px] max-w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 bg-card pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter items"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <ColumnConfig visibleColumns={visibleColumns} onColumnsChange={setVisibleColumns} />

            <Button variant="outline" className="h-9">
              <CircleHelp className="h-4 w-4" />
              Actions
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button className="h-9" onClick={openCreateItemDialog}>
              <Plus className="h-4 w-4" />
              Add item
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="h-9" onClick={() => void refreshAll()}>
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Click editable cells (supplier, quantities, units, order method, location). Changes save automatically when
          you press Enter or click away.
        </p>

        {/* ── Table / Card list ────────────────────────────── */}

        {isMobile ? (
          <>
            <ItemCardList
              parts={pagedParts}
              selectedIds={selectedIds}
              onToggleSelect={toggleOne}
              onOpenItemDetail={openItemDetailDialog}
              queueStatsByPartId={queueStatsByPartId}
              orderLineByItem={orderLineByItem}
              session={session}
            />
            {pagedParts.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No items match your search.</p>
            )}
          </>
        ) : (
          <div className="overflow-hidden rounded-lg border border-table-border bg-card shadow-arda-sm">
            <div className="overflow-x-auto">
              <TooltipProvider delayDuration={140}>
                <table
                  className="w-full divide-y divide-table-border text-[12.5px]"
                  style={{ minWidth: `${tableMinWidth}px` }}
                >
                  <thead className="bg-table-header text-[12px]">
                    <tr>
                      <th className="table-cell-density w-9">
                        <input
                          type="checkbox"
                          aria-label="Select all items"
                          className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                          checked={pagedParts.length > 0 && selectedIds.size === pagedParts.length}
                          ref={(el) => {
                            if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < pagedParts.length;
                          }}
                          onChange={toggleAll}
                        />
                      </th>
                      {visibleColumns.map((columnKey) => {
                        const column = ITEM_TABLE_COLUMNS.find((c) => c.key === columnKey);
                        if (!column) return null;
                        return (
                          <th
                            key={columnKey}
                            className="table-cell-density text-left font-semibold whitespace-nowrap"
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default truncate">{column.label}</span>
                              </TooltipTrigger>
                              <TooltipContent>{column.label}</TooltipContent>
                            </Tooltip>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedParts.length === 0 && (
                      <tr>
                        <td colSpan={tableColumnCount} className="px-4 py-10 text-center text-muted-foreground">
                          No items match your search.
                        </td>
                      </tr>
                    )}

                    {pagedParts.map((part) => (
                      <ItemRow
                        key={part.id}
                        part={part}
                        visibleColumnsSet={visibleColumnsSet}
                        visibleColumns={visibleColumns}
                        queueStatsByPartId={queueStatsByPartId}
                        orderLineByItem={orderLineByItem}
                        session={session}
                        onOptimisticUpdate={applyOptimisticUpdate}
                        isSelected={selectedIds.has(part.id)}
                        onToggle={() => toggleOne(part.id)}
                        onOpenDetail={openItemDetailDialog}
                      />
                    ))}
                  </tbody>
                </table>
              </TooltipProvider>
            </div>

            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={filteredParts.length}
              firstIndex={firstVisibleIndex}
              lastIndex={lastVisibleIndex}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}

        {/* Pagination also on mobile */}
        {isMobile && pagedParts.length > 0 && (
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredParts.length}
            firstIndex={firstVisibleIndex}
            lastIndex={lastVisibleIndex}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}

        </div>
      </section>

      {/* ── Bulk actions bar (slides up when items selected) ─── */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        selectedCardIds={selectedCardIds}
        session={session}
        onDeselectAll={() => setSelectedIds(new Set())}
        onComplete={() => {
          setSelectedIds(new Set());
          void refreshAll();
        }}
      />
      <ItemDetailDialog
        open={itemDialogState.open}
        mode={itemDialogState.mode}
        part={itemDialogState.part}
        session={session}
        onUnauthorized={onUnauthorized}
        onOpenChange={(nextOpen) => {
          setItemDialogState((prev) => ({ ...prev, open: nextOpen }));
        }}
        onSaved={async () => {
          await refreshAll();
        }}
      />
    </div>
  );
}

/* ── Quick action buttons with real API calls ─────────────────── */

type ActionState = "idle" | "loading" | "done";

function QuickActions({
  part,
  cardIds,
  notes,
  session,
}: {
  part: PartRecord;
  cardIds: string[];
  notes: string;
  session: AuthSession;
}) {
  const [printState, setPrintState] = React.useState<ActionState>("idle");
  const [orderState, setOrderState] = React.useState<ActionState>("idle");
  const hasCards = cardIds.length > 0;

  const handlePrint = React.useCallback(async () => {
    if (!hasCards) {
      toast.error("No kanban cards to print for this item.");
      return;
    }
    setPrintState("loading");
    try {
      await createPrintJob(session.tokens.accessToken, { cardIds });
      setPrintState("done");
      toast.success(`Print job queued for ${cardIds.length} card${cardIds.length > 1 ? "s" : ""}`);
      setTimeout(() => setPrintState("idle"), 1500);
    } catch (err) {
      setPrintState("idle");
      toast.error(parseApiError(err));
    }
  }, [cardIds, hasCards, session.tokens.accessToken]);

  const handleCreateOrder = React.useCallback(async () => {
    if (!hasCards) {
      toast.error("No kanban cards to create an order from.");
      return;
    }
    setOrderState("loading");
    try {
      const result = await createPurchaseOrderFromCards(session.tokens.accessToken, { cardIds });
      setOrderState("done");
      toast.success(`Purchase order ${result.poNumber} created`);
      setTimeout(() => setOrderState("idle"), 1500);
    } catch (err) {
      setOrderState("idle");
      toast.error(parseApiError(err));
    }
  }, [cardIds, hasCards, session.tokens.accessToken]);

  const actionBtnClass =
    "h-7 w-7 rounded-md border-border/80 transition-all hover:border-primary/45 hover:bg-[hsl(var(--arda-orange)/0.1)] active:scale-95";

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={actionBtnClass}
            disabled={orderState === "loading"}
            onClick={handleCreateOrder}
            aria-label={`Create order for ${part.partNumber}`}
          >
            {orderState === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : orderState === "done" ? (
              <Check className="h-3.5 w-3.5 text-[hsl(var(--arda-success))]" />
            ) : (
              <ShoppingCart className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {hasCards ? `Create PO from ${cardIds.length} card${cardIds.length > 1 ? "s" : ""}` : "No cards in queue"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={actionBtnClass}
            disabled={printState === "loading"}
            onClick={handlePrint}
            aria-label={`Print labels for ${part.partNumber}`}
          >
            {printState === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : printState === "done" ? (
              <Check className="h-3.5 w-3.5 text-[hsl(var(--arda-success))]" />
            ) : (
              <Printer className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {hasCards ? `Print ${cardIds.length} card${cardIds.length > 1 ? "s" : ""}` : "No cards to print"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={actionBtnClass}
            aria-label={`View notes for ${part.partNumber}`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px]">{notes}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/* ── Memoized table row ─────────────────────────────────────── */

interface ItemRowProps {
  part: PartRecord;
  visibleColumnsSet: Set<ItemTableColumnKey>;
  visibleColumns: ItemTableColumnKey[];
  queueStatsByPartId: Map<string, {
    cards: number;
    cardIds: string[];
    minUnits: number | null;
    orderUnits: number | null;
    queueUpdatedAt: string | null;
    latestStage: string | null;
    loopTypes: Set<LoopType>;
  }>;
  orderLineByItem: Record<string, import("@/types").OrderLineByItemSummary>;
  session: AuthSession;
  onOptimisticUpdate: (partId: string, patch: Partial<PartRecord>) => void;
  isSelected: boolean;
  onToggle: () => void;
  onOpenDetail: (part: PartRecord) => void;
}

const ItemRow = React.memo(function ItemRow({
  part,
  visibleColumnsSet,
  visibleColumns,
  queueStatsByPartId,
  orderLineByItem,
  session,
  onOptimisticUpdate,
  isSelected,
  onToggle,
  onOpenDetail,
}: ItemRowProps) {
  const queueStats = queueStatsByPartId.get(part.id);
  const orderLineSummary = orderLineByItem[part.eId ?? part.id];
  const queueUpdatedAt = queueStats?.queueUpdatedAt ?? null;
  const itemCode = part.externalGuid || part.partNumber || part.id;
  const itemName = part.name?.trim() || "Unnamed item";
  const supplierLabel = part.primarySupplier || "—";
  const orderMethod = formatReadableLabel(part.orderMechanism || part.type || null);
  const minQty = part.minQty ?? queueStats?.minUnits ?? null;
  const minQtyUnit = part.minQtyUnit || part.uom || null;
  const orderQty = part.orderQty ?? queueStats?.orderUnits ?? orderLineSummary?.orderedQty ?? null;
  const orderQtyUnit = part.orderQtyUnit || part.uom || orderLineSummary?.orderedQtyUnit || null;
  const statusSource =
    orderLineSummary?.status || queueStats?.latestStage || (part.isActive ? "ACTIVE" : "INACTIVE");
  const statusLabel = formatStatus(statusSource);
  const updatedAt =
    [orderLineSummary?.updatedAt, queueUpdatedAt, part.updatedAt]
      .filter((c): c is string => Boolean(c))
      .sort()
      .at(-1) ?? part.updatedAt;
  const normalizedStatus = statusSource.toLowerCase();
  const statusVariant =
    /completed|received|accepted/i.test(normalizedStatus)
      ? "success"
      : /new|committed|receiving|requested|depleted|pending|withdrawn/i.test(normalizedStatus)
        ? "warning"
        : /active/i.test(normalizedStatus)
          ? "accent"
          : "secondary";
  const parsedPartUnitPrice =
    typeof part.unitPrice === "number"
      ? part.unitPrice
      : typeof part.unitPrice === "string"
        ? Number.parseFloat(part.unitPrice.replace(/[^0-9.-]/g, ""))
        : null;
  const fallbackPartUnitPrice =
    parsedPartUnitPrice !== null && Number.isFinite(parsedPartUnitPrice) ? parsedPartUnitPrice : null;
  const notes = orderLineSummary?.notes || part.notes || "—";
  const isEditable = Boolean(part.eId);

  // Stable commit handler factory
  const makeCommit = React.useCallback(
    (field: InlineEditableField) =>
      buildCommitHandler(part, field, session, onOptimisticUpdate),
    [part, session, onOptimisticUpdate],
  );

  const renderCell = (columnKey: ItemTableColumnKey) => {
    switch (columnKey) {
      case "item":
        return (
          <td key={columnKey} className="table-cell-density">
            <div className="flex min-w-[220px] flex-col">
              <span className="link-arda leading-tight" title={itemCode}>
                {itemCode}
              </span>
              <span className="truncate text-[12px] text-muted-foreground" title={itemName}>
                {itemName}
              </span>
            </div>
          </td>
        );

      case "image":
        return (
          <td key={columnKey} className="table-cell-density">
            {part.imageUrl ? (
              <img
                src={part.imageUrl}
                alt={`${part.partNumber} preview`}
                className="h-7 w-12 rounded-sm border border-border object-cover"
                title={part.imageUrl}
              />
            ) : (
              <span className="inline-flex h-7 w-12 items-center justify-center rounded-sm border border-border bg-muted text-[10px] font-semibold text-muted-foreground">
                {part.partNumber.slice(0, 2).toUpperCase()}
              </span>
            )}
          </td>
        );

      case "quickActions":
        return (
          <td key={columnKey} className="table-cell-density">
            <QuickActions
              part={part}
              cardIds={queueStats?.cardIds ?? []}
              notes={notes}
              session={session}
            />
          </td>
        );

      case "supplier":
        return (
          <td key={columnKey} className="table-cell-density">
            <EditableCell
              displayValue={supplierLabel}
              rawValue={part.primarySupplier ?? ""}
              editable={isEditable}
              placeholder="Supplier name"
              onCommit={makeCommit("supplier")}
            />
          </td>
        );

      case "unitPrice":
        return (
          <td key={columnKey} className="table-cell-density">
            {formatMoney(
              orderLineSummary?.unitCostValue ?? fallbackPartUnitPrice,
              orderLineSummary?.unitCostCurrency,
            )}
          </td>
        );

      case "orderQuantity":
        return (
          <td key={columnKey} className="table-cell-density">
            <EditableCell
              displayValue={formatNumericValue(orderQty)}
              rawValue={orderQty == null ? "" : String(orderQty)}
              editable={isEditable}
              inputType="number"
              placeholder="0"
              onCommit={makeCommit("orderQuantity")}
            />
          </td>
        );

      case "orderUnits":
        return (
          <td key={columnKey} className="table-cell-density text-muted-foreground">
            <EditableCell
              displayValue={orderQtyUnit || "—"}
              rawValue={orderQtyUnit || ""}
              editable={isEditable}
              placeholder="Units"
              onCommit={makeCommit("orderUnits")}
            />
          </td>
        );

      case "minQuantity":
        return (
          <td key={columnKey} className="table-cell-density">
            <EditableCell
              displayValue={formatNumericValue(minQty)}
              rawValue={minQty == null ? "" : String(minQty)}
              editable={isEditable}
              inputType="number"
              placeholder="0"
              onCommit={makeCommit("minQuantity")}
            />
          </td>
        );

      case "minUnits":
        return (
          <td key={columnKey} className="table-cell-density text-muted-foreground">
            <EditableCell
              displayValue={minQtyUnit || "—"}
              rawValue={minQtyUnit || ""}
              editable={isEditable}
              placeholder="Units"
              onCommit={makeCommit("minUnits")}
            />
          </td>
        );

      case "cards":
        return (
          <td key={columnKey} className="table-cell-density font-semibold text-[hsl(var(--table-link))]">
            {queueStats?.cards ?? 0}
          </td>
        );

      case "notes":
        return (
          <td key={columnKey} className="table-cell-density text-muted-foreground">
            <span className="block max-w-[260px] truncate" title={notes}>
              {notes}
            </span>
          </td>
        );

      case "orderMethod":
        return (
          <td key={columnKey} className="table-cell-density">
            <EditableCell
              displayValue={orderMethod}
              rawValue={part.orderMechanism || part.type || ""}
              editable={isEditable}
              placeholder="Order method"
              onCommit={makeCommit("orderMethod")}
            />
          </td>
        );

      case "location":
        return (
          <td key={columnKey} className="table-cell-density text-muted-foreground">
            <EditableCell
              displayValue={part.location || "—"}
              rawValue={part.location || ""}
              editable={isEditable}
              placeholder="Location"
              onCommit={makeCommit("location")}
            />
          </td>
        );

      case "status":
        return (
          <td key={columnKey} className="table-cell-density">
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </td>
        );

      case "updated":
        return (
          <td key={columnKey} className="table-cell-density text-muted-foreground">
            {formatDateTime(updatedAt)}
          </td>
        );

      case "glCode":
        return (
          <td key={columnKey} className="table-cell-density text-muted-foreground">
            {part.glCode || "—"}
          </td>
        );

      default:
        return null;
    }
  };

  const STATUS_ROW_CLASSES: Record<string, string> = {
    success:   "border-l-4 border-l-[hsl(var(--arda-success))] bg-[hsl(var(--arda-success)/0.03)]",
    warning:   "border-l-4 border-l-[hsl(var(--arda-warning))] bg-[hsl(var(--arda-warning)/0.03)]",
    accent:    "border-l-4 border-l-[hsl(var(--arda-blue))] bg-[hsl(var(--arda-blue)/0.03)]",
    secondary: "",
  };

  return (
    <tr className={cn(
      "border-t border-table-border hover:bg-table-row-hover/70",
      STATUS_ROW_CLASSES[statusVariant],
      isSelected && "bg-[hsl(var(--arda-blue)/0.06)]",
      "cursor-pointer",
    )}
    onClick={(event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button,input,a,textarea,select,label,[role='button']")) return;
      onOpenDetail(part);
    }}>
      <td className="table-cell-density">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          aria-label={`Select ${part.partNumber}`}
          className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
      </td>
      {visibleColumns.map(renderCell)}
    </tr>
  );
});

/* ── Item detail / edit dialog ──────────────────────────────── */

interface ItemDetailDialogProps {
  open: boolean;
  mode: "create" | "edit";
  part: PartRecord | null;
  session: AuthSession;
  onUnauthorized: () => void;
  onOpenChange: (nextOpen: boolean) => void;
  onSaved: () => Promise<void>;
}

function ItemDetailDialog({
  open,
  mode,
  part,
  session,
  onUnauthorized,
  onOpenChange,
  onSaved,
}: ItemDetailDialogProps) {
  const [itemCode, setItemCode] = React.useState("");
  const [itemName, setItemName] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [orderMethod, setOrderMethod] = React.useState("");
  const [minQty, setMinQty] = React.useState("0");
  const [minQtyUnit, setMinQtyUnit] = React.useState("each");
  const [orderQty, setOrderQty] = React.useState("");
  const [orderQtyUnit, setOrderQtyUnit] = React.useState("each");
  const [isSavingItem, setIsSavingItem] = React.useState(false);

  const [loops, setLoops] = React.useState<KanbanLoop[]>([]);
  const [isLoadingLoops, setIsLoadingLoops] = React.useState(false);
  const [savingLoopId, setSavingLoopId] = React.useState<string | null>(null);
  const [loopReason, setLoopReason] = React.useState("Updated from item detail view");
  const [loopEdits, setLoopEdits] = React.useState<
    Record<string, { numberOfCards: string; minQuantity: string; orderQuantity: string }>
  >({});

  const isCreateMode = mode === "create";

  const seedFromPart = React.useCallback((nextPart: PartRecord | null) => {
    const fallbackCode = nextPart?.externalGuid?.trim() || nextPart?.partNumber || "";
    setItemCode(fallbackCode);
    setItemName(nextPart?.name?.trim() || "");
    setSupplier(nextPart?.primarySupplier?.trim() || "");
    setLocation(nextPart?.location?.trim() || "");
    setOrderMethod(nextPart?.orderMechanism?.trim() || nextPart?.type?.trim() || "unspecified");
    setMinQty(String(nextPart?.minQty ?? 0));
    setMinQtyUnit(nextPart?.minQtyUnit?.trim() || nextPart?.uom?.trim() || "each");
    setOrderQty(
      typeof nextPart?.orderQty === "number" && Number.isFinite(nextPart.orderQty)
        ? String(nextPart.orderQty)
        : ""
    );
    setOrderQtyUnit(nextPart?.orderQtyUnit?.trim() || nextPart?.uom?.trim() || "each");
  }, []);

  const loadLoops = React.useCallback(async () => {
    if (!open || isCreateMode || !part) {
      setLoops([]);
      setLoopEdits({});
      return;
    }

    setIsLoadingLoops(true);
    try {
      const result = await fetchLoops(session.tokens.accessToken, { page: 1, pageSize: 200 });
      const matchingLoops = result.data.filter((loop) => loop.partId === part.id);
      setLoops(matchingLoops);
      setLoopEdits(
        matchingLoops.reduce(
          (acc, loop) => {
            acc[loop.id] = {
              numberOfCards: String(loop.numberOfCards),
              minQuantity: String(loop.minQuantity),
              orderQuantity: String(loop.orderQuantity),
            };
            return acc;
          },
          {} as Record<string, { numberOfCards: string; minQuantity: string; orderQuantity: string }>
        )
      );
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return;
      }
      toast.error(parseApiError(error));
      setLoops([]);
      setLoopEdits({});
    } finally {
      setIsLoadingLoops(false);
    }
  }, [isCreateMode, onUnauthorized, open, part, session.tokens.accessToken]);

  React.useEffect(() => {
    if (!open) return;
    seedFromPart(part);
  }, [open, part, seedFromPart]);

  React.useEffect(() => {
    void loadLoops();
  }, [loadLoops]);

  const handleSaveItem = React.useCallback(async () => {
    const normalizedCode = itemCode.trim();
    if (!normalizedCode) {
      toast.error("Item code is required.");
      return;
    }
    if (!itemName.trim()) {
      toast.error("Item name is required.");
      return;
    }

    const parsedMinQty = Number.parseInt(minQty.trim() || "0", 10);
    if (!Number.isFinite(parsedMinQty) || parsedMinQty < 0) {
      toast.error("Min quantity must be a whole number >= 0.");
      return;
    }

    const normalizedOrderQty = orderQty.trim();
    const parsedOrderQty =
      normalizedOrderQty === "" ? null : Number.parseInt(normalizedOrderQty, 10);
    if (parsedOrderQty !== null && (!Number.isFinite(parsedOrderQty) || parsedOrderQty < 0)) {
      toast.error("Order quantity must be a whole number >= 0.");
      return;
    }

    const entityId = part?.eId || normalizedCode;
    const author = normalizeOptionalString(session.user.email) || session.user.id;

    setIsSavingItem(true);
    try {
      await updateItemRecord(session.tokens.accessToken, {
        entityId,
        tenantId: session.user.tenantId,
        author,
        payload: {
          externalGuid: normalizedCode,
          name: itemName.trim(),
          orderMechanism: orderMethod.trim() || "unspecified",
          location: normalizeOptionalString(location),
          minQty: parsedMinQty,
          minQtyUnit: minQtyUnit.trim() || "each",
          orderQty: parsedOrderQty,
          orderQtyUnit: normalizeOptionalString(orderQtyUnit),
          primarySupplier: supplier.trim() || "Unknown supplier",
          primarySupplierLink: null,
          imageUrl: normalizeOptionalString(part?.imageUrl ?? null),
        },
      });
      toast.success(isCreateMode ? "Item created with an initial card." : "Item updated.");
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return;
      }
      toast.error(parseApiError(error));
    } finally {
      setIsSavingItem(false);
    }
  }, [
    isCreateMode,
    itemCode,
    itemName,
    location,
    minQty,
    minQtyUnit,
    onOpenChange,
    onSaved,
    onUnauthorized,
    orderMethod,
    orderQty,
    orderQtyUnit,
    part?.eId,
    part?.imageUrl,
    session.tokens.accessToken,
    session.user.email,
    session.user.id,
    session.user.tenantId,
    supplier,
  ]);

  const handleSaveLoop = React.useCallback(
    async (loop: KanbanLoop) => {
      const edit = loopEdits[loop.id];
      if (!edit) return;

      const parsedCardCount = Number.parseInt(edit.numberOfCards, 10);
      const parsedMinQty = Number.parseInt(edit.minQuantity, 10);
      const parsedOrderQty = Number.parseInt(edit.orderQuantity, 10);
      if (!Number.isFinite(parsedCardCount) || parsedCardCount < 1) {
        toast.error("Number of cards must be a whole number >= 1.");
        return;
      }
      if (!Number.isFinite(parsedMinQty) || parsedMinQty < 1) {
        toast.error("Loop min quantity must be a whole number >= 1.");
        return;
      }
      if (!Number.isFinite(parsedOrderQty) || parsedOrderQty < 1) {
        toast.error("Loop order quantity must be a whole number >= 1.");
        return;
      }

      const reason = loopReason.trim() || "Updated from item detail view";

      setSavingLoopId(loop.id);
      try {
        await updateLoopParameters(session.tokens.accessToken, loop.id, {
          numberOfCards: parsedCardCount,
          minQuantity: parsedMinQty,
          orderQuantity: parsedOrderQty,
          reason,
        });
        toast.success(`${LOOP_META[loop.loopType].label} loop updated.`);
        await loadLoops();
        await onSaved();
      } catch (error) {
        if (isUnauthorized(error)) {
          onUnauthorized();
          return;
        }
        toast.error(parseApiError(error));
      } finally {
        setSavingLoopId(null);
      }
    },
    [loadLoops, loopEdits, loopReason, onSaved, onUnauthorized, session.tokens.accessToken]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isCreateMode ? "Create Item" : "Item Detail & Edit"}</DialogTitle>
          <DialogDescription>
            {isCreateMode
              ? "Save to create the item and automatically provision one initial card."
              : "Edit item fields and manage multi-card loop parameters from one place."}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Item code</label>
              <Input value={itemCode} onChange={(event) => setItemCode(event.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Item name</label>
              <Input value={itemName} onChange={(event) => setItemName(event.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Supplier</label>
              <Input value={supplier} onChange={(event) => setSupplier(event.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Order method</label>
              <Input value={orderMethod} onChange={(event) => setOrderMethod(event.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Min quantity</label>
              <Input
                type="number"
                min={0}
                value={minQty}
                onChange={(event) => setMinQty(event.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Min unit</label>
              <Input value={minQtyUnit} onChange={(event) => setMinQtyUnit(event.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Order quantity</label>
              <Input
                type="number"
                min={0}
                value={orderQty}
                onChange={(event) => setOrderQty(event.target.value)}
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Order unit</label>
              <Input value={orderQtyUnit} onChange={(event) => setOrderQtyUnit(event.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void handleSaveItem()} disabled={isSavingItem}>
              {isSavingItem && <Loader2 className="h-4 w-4 animate-spin" />}
              {isCreateMode ? "Create item" : "Save item"}
            </Button>
          </div>
        </section>

        {!isCreateMode && (
          <section className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Loop Management</h3>
              <p className="text-xs text-muted-foreground">
                Manage multi-card behavior by editing each loop&apos;s card count.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Audit reason</label>
              <Input value={loopReason} onChange={(event) => setLoopReason(event.target.value)} className="mt-1" />
            </div>

            {isLoadingLoops && (
              <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                Loading loops...
              </div>
            )}

            {!isLoadingLoops && loops.length === 0 && (
              <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                No loops found for this item yet.
              </div>
            )}

            {!isLoadingLoops &&
              loops.map((loop) => {
                const loopEdit = loopEdits[loop.id];
                return (
                  <div key={loop.id} className="rounded-md border border-border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{LOOP_META[loop.loopType].label}</Badge>
                        <span className="text-xs text-muted-foreground">{loop.id.slice(0, 8)}...</span>
                      </div>
                      <Button
                        size="sm"
                        disabled={!loopEdit || savingLoopId === loop.id}
                        onClick={() => void handleSaveLoop(loop)}
                      >
                        {savingLoopId === loop.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Save loop
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground"># of cards</label>
                        <Input
                          type="number"
                          min={1}
                          value={loopEdit?.numberOfCards ?? String(loop.numberOfCards)}
                          onChange={(event) =>
                            setLoopEdits((prev) => ({
                              ...prev,
                              [loop.id]: {
                                numberOfCards: event.target.value,
                                minQuantity: prev[loop.id]?.minQuantity ?? String(loop.minQuantity),
                                orderQuantity: prev[loop.id]?.orderQuantity ?? String(loop.orderQuantity),
                              },
                            }))
                          }
                          className="mt-1 h-8"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground">Min quantity</label>
                        <Input
                          type="number"
                          min={1}
                          value={loopEdit?.minQuantity ?? String(loop.minQuantity)}
                          onChange={(event) =>
                            setLoopEdits((prev) => ({
                              ...prev,
                              [loop.id]: {
                                numberOfCards: prev[loop.id]?.numberOfCards ?? String(loop.numberOfCards),
                                minQuantity: event.target.value,
                                orderQuantity: prev[loop.id]?.orderQuantity ?? String(loop.orderQuantity),
                              },
                            }))
                          }
                          className="mt-1 h-8"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground">Order quantity</label>
                        <Input
                          type="number"
                          min={1}
                          value={loopEdit?.orderQuantity ?? String(loop.orderQuantity)}
                          onChange={(event) =>
                            setLoopEdits((prev) => ({
                              ...prev,
                              [loop.id]: {
                                numberOfCards: prev[loop.id]?.numberOfCards ?? String(loop.numberOfCards),
                                minQuantity: prev[loop.id]?.minQuantity ?? String(loop.minQuantity),
                                orderQuantity: event.target.value,
                              },
                            }))
                          }
                          className="mt-1 h-8"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
