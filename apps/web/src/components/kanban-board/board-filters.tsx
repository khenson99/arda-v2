import * as React from "react";
import { Search, RefreshCw, Loader2 } from "lucide-react";
import { Badge, Button, Card, CardContent, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { KanbanCard, CardStage, LoopType } from "@/types";
import { CARD_STAGES, CARD_STAGE_META, LOOP_META, LOOP_ORDER } from "@/types";
import type { GroupedCards } from "@/hooks/use-kanban-board";

/* ── Loop type filter pill ──────────────────────────────────── */

function LoopPill({
  loopType,
  isActive,
  count,
  onToggle,
}: {
  loopType: LoopType;
  isActive: boolean;
  count: number;
  onToggle: () => void;
}) {
  const meta = LOOP_META[loopType];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        isActive
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
      <span className="ml-0.5 text-[10px] opacity-70">({count})</span>
    </button>
  );
}

/* ── Stage mini-count ───────────────────────────────────────── */

function StageMiniCount({
  stage,
  count,
}: {
  stage: CardStage;
  count: number;
}) {
  const meta = CARD_STAGE_META[stage];

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      <span className="text-xs text-muted-foreground">{meta.label}</span>
      <span className="text-xs font-semibold">{count}</span>
    </div>
  );
}

/* ── BoardFilters component ─────────────────────────────────── */

export interface BoardFilterState {
  searchTerm: string;
  activeLoopTypes: Set<LoopType>;
}

interface BoardFiltersProps {
  allCards: KanbanCard[];
  grouped: GroupedCards;
  filters: BoardFilterState;
  onFiltersChange: (filters: BoardFilterState) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function BoardFilters({
  allCards,
  grouped,
  filters,
  onFiltersChange,
  isRefreshing,
  onRefresh,
}: BoardFiltersProps) {
  const totalCards = allCards.length;

  // Count cards by loop type
  const countByLoop = React.useMemo(() => {
    const counts: Record<LoopType, number> = {
      procurement: 0,
      production: 0,
      transfer: 0,
    };
    for (const card of allCards) {
      if (card.loopType && card.loopType in counts) {
        counts[card.loopType]++;
      }
    }
    return counts;
  }, [allCards]);

  const handleSearchChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFiltersChange({ ...filters, searchTerm: e.target.value });
    },
    [filters, onFiltersChange],
  );

  const handleLoopToggle = React.useCallback(
    (loopType: LoopType) => {
      const next = new Set(filters.activeLoopTypes);
      if (next.has(loopType)) {
        next.delete(loopType);
      } else {
        next.add(loopType);
      }
      onFiltersChange({ ...filters, activeLoopTypes: next });
    },
    [filters, onFiltersChange],
  );

  return (
    <Card className="border-border/60">
      <CardContent className="space-y-3 p-4">
        {/* Row 1: Search + Refresh */}
        <div className="flex items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="bg-background pl-9"
              value={filters.searchTerm}
              onChange={handleSearchChange}
              placeholder="Search by card # or part name"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="gap-1.5"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>

          <Badge variant="secondary" className="ml-auto text-xs">
            {totalCards} {totalCards === 1 ? "card" : "cards"}
          </Badge>
        </div>

        {/* Row 2: Loop type pills + stage mini-counts */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Loop pills */}
          {LOOP_ORDER.map((loopType) => (
            <LoopPill
              key={loopType}
              loopType={loopType}
              isActive={filters.activeLoopTypes.has(loopType)}
              count={countByLoop[loopType]}
              onToggle={() => handleLoopToggle(loopType)}
            />
          ))}

          {/* Divider */}
          <div className="mx-1 h-5 w-px bg-border" />

          {/* Stage mini-counts */}
          <div className="flex flex-wrap items-center gap-3">
            {CARD_STAGES.map((stage) => (
              <StageMiniCount
                key={stage}
                stage={stage}
                count={grouped[stage].length}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
