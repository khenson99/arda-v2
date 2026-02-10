import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import {
  BoardContainer,
  BoardFilters,
  CardDetailDrawer,
} from "@/components/kanban-board";
import type { BoardFilterState } from "@/components/kanban-board";
import { useKanbanBoard } from "@/hooks/use-kanban-board";
import type { GroupedCards } from "@/hooks/use-kanban-board";
import type { AuthSession, KanbanCard, LoopType } from "@/types";
import { CARD_STAGES } from "@/types";

/* ── Filter logic ───────────────────────────────────────────── */

function applyFilters(
  grouped: GroupedCards,
  allCards: KanbanCard[],
  filters: BoardFilterState,
): { filteredGrouped: GroupedCards; filteredAllCards: KanbanCard[] } {
  const search = filters.searchTerm.trim().toLowerCase();
  const hasLoopFilter = filters.activeLoopTypes.size > 0;

  const matchesCard = (card: KanbanCard): boolean => {
    // Loop type filter
    if (hasLoopFilter && card.loopType && !filters.activeLoopTypes.has(card.loopType)) {
      return false;
    }

    // Search filter
    if (search) {
      const cardNum = String(card.cardNumber);
      const partName = (card.partName ?? "").toLowerCase();
      if (!cardNum.includes(search) && !partName.includes(search)) {
        return false;
      }
    }

    return true;
  };

  const filteredAllCards = allCards.filter(matchesCard);

  const filteredGrouped = {} as GroupedCards;
  for (const stage of CARD_STAGES) {
    filteredGrouped[stage] = grouped[stage].filter(matchesCard);
  }

  return { filteredGrouped, filteredAllCards };
}

/* ── Loading skeleton ───────────────────────────────────────── */

function BoardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[88px] w-full rounded-xl" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-[260px] shrink-0">
            <Skeleton className="h-10 w-full rounded-t-xl" />
            <div className="space-y-2 p-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-[72px] w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Error state ────────────────────────────────────────────── */

function BoardError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12">
      <AlertCircle className="mb-3 h-10 w-10 text-destructive/60" />
      <p className="mb-1 text-sm font-semibold text-destructive">
        Failed to load board
      </p>
      <p className="mb-4 text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

/* ── Board page route ───────────────────────────────────────── */

interface Props {
  session: AuthSession;
  onUnauthorized: () => void;
}

export function BoardRoute({ session, onUnauthorized }: Props) {
  const {
    isLoading,
    isRefreshing,
    error,
    allCards,
    grouped,
    moveCard,
    refresh,
  } = useKanbanBoard(session.tokens.accessToken, onUnauthorized);

  /* ── Filter state ──────────────────────────────────────────── */

  const [filters, setFilters] = React.useState<BoardFilterState>({
    searchTerm: "",
    activeLoopTypes: new Set<LoopType>(),
  });

  const { filteredGrouped, filteredAllCards } = React.useMemo(
    () => applyFilters(grouped, allCards, filters),
    [grouped, allCards, filters],
  );

  /* ── Detail drawer state ───────────────────────────────────── */

  const [selectedCard, setSelectedCard] = React.useState<KanbanCard | null>(null);

  const handleCardClick = React.useCallback((card: KanbanCard) => {
    setSelectedCard(card);
  }, []);

  const handleCloseDrawer = React.useCallback(() => {
    setSelectedCard(null);
  }, []);

  /* ── Render ────────────────────────────────────────────────── */

  if (isLoading) {
    return <BoardSkeleton />;
  }

  if (error && allCards.length === 0) {
    return <BoardError message={error} onRetry={() => void refresh()} />;
  }

  return (
    <div className="space-y-4">
      <BoardFilters
        allCards={allCards}
        grouped={filteredGrouped}
        filters={filters}
        onFiltersChange={setFilters}
        isRefreshing={isRefreshing}
        onRefresh={() => void refresh()}
      />

      <BoardContainer
        grouped={filteredGrouped}
        allCards={filteredAllCards}
        moveCard={moveCard}
        onCardClick={handleCardClick}
      />

      <CardDetailDrawer
        card={selectedCard}
        token={session.tokens.accessToken}
        onUnauthorized={onUnauthorized}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}
