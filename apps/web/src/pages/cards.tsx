import * as React from "react";
import { RefreshCw, ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import type { AuthSession } from "@/types";
import { useKanbanCards } from "@/hooks/use-kanban-cards";
import { CardFilters, CardsTable } from "@/components/kanban-cards";
import { Button } from "@/components/ui";

/* ── Props ───────────────────────────────────────────────────── */

interface Props {
  session: AuthSession;
  onUnauthorized: () => void;
}

/* ── Page ─────────────────────────────────────────────────────── */

export function CardsRoute({ session, onUnauthorized }: Props) {
  const {
    cards,
    pagination,
    isLoading,
    error,
    filters,
    setFilters,
    refresh,
  } = useKanbanCards(session.tokens.accessToken, onUnauthorized);

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  }, [refresh]);

  const handlePrev = React.useCallback(() => {
    if (pagination.page > 1) {
      setFilters((f) => ({ ...f, page: f.page - 1 }));
    }
  }, [pagination.page, setFilters]);

  const handleNext = React.useCallback(() => {
    if (pagination.page < pagination.totalPages) {
      setFilters((f) => ({ ...f, page: f.page + 1 }));
    }
  }, [pagination.page, pagination.totalPages, setFilters]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Kanban Cards</h1>
            <p className="text-xs text-muted-foreground">
              {pagination.total > 0
                ? `${pagination.total} card${pagination.total !== 1 ? "s" : ""} total`
                : "Manage physical kanban cards"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <CardFilters filters={filters} onFiltersChange={setFilters} />

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <CardsTable
        cards={cards}
        isLoading={isLoading}
        token={session.tokens.accessToken}
        onUnauthorized={onUnauthorized}
        onRefresh={refresh}
      />

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handlePrev}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleNext}
              disabled={pagination.page >= pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
