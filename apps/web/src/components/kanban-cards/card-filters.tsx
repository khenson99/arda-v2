import * as React from "react";
import { Search, X } from "lucide-react";
import type { CardStage, LoopType } from "@/types";
import { CARD_STAGES, CARD_STAGE_META, LOOP_META, LOOP_ORDER } from "@/types";
import { cn } from "@/lib/utils";
import { Button, Input, Badge } from "@/components/ui";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui";
import type { CardFilters as CardFiltersState } from "@/hooks/use-kanban-cards";

/* ── Props ───────────────────────────────────────────────────── */

interface CardFiltersProps {
  filters: CardFiltersState;
  onFiltersChange: React.Dispatch<React.SetStateAction<CardFiltersState>>;
}

/* ── Component ───────────────────────────────────────────────── */

export function CardFilters({ filters, onFiltersChange }: CardFiltersProps) {
  const [searchValue, setSearchValue] = React.useState(filters.search);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();

  // Debounced search
  const handleSearchChange = React.useCallback(
    (value: string) => {
      setSearchValue(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFiltersChange((prev) => ({ ...prev, search: value }));
      }, 300);
    },
    [onFiltersChange],
  );

  React.useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Stage filter
  const handleStageSelect = React.useCallback(
    (stage: CardStage | null) => {
      onFiltersChange((prev) => ({
        ...prev,
        stage: prev.stage === stage ? null : stage,
      }));
    },
    [onFiltersChange],
  );

  // Loop type filter
  const handleLoopTypeSelect = React.useCallback(
    (lt: LoopType) => {
      onFiltersChange((prev) => ({
        ...prev,
        loopType: prev.loopType === lt ? null : lt,
      }));
    },
    [onFiltersChange],
  );

  // Active filter count
  const activeCount =
    (filters.stage ? 1 : 0) +
    (filters.loopType ? 1 : 0) +
    (filters.search.trim() ? 1 : 0);

  // Clear all filters
  const handleClearAll = React.useCallback(() => {
    setSearchValue("");
    onFiltersChange((prev) => ({
      ...prev,
      stage: null,
      loopType: null,
      search: "",
    }));
  }, [onFiltersChange]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      {/* Search input */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search card # or part name..."
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => handleSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Stage dropdown */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm">
            Stage
            {filters.stage && (
              <Badge
                className={cn(
                  "ml-1 px-1.5 py-0 text-[10px] leading-4",
                  CARD_STAGE_META[filters.stage].bgClass,
                  CARD_STAGE_META[filters.stage].textClass,
                )}
              >
                {CARD_STAGE_META[filters.stage].label}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => handleStageSelect(null)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                filters.stage === null
                  ? "bg-muted font-medium"
                  : "hover:bg-muted/50",
              )}
            >
              All Stages
            </button>
            {CARD_STAGES.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => handleStageSelect(stage)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                  filters.stage === stage
                    ? "bg-muted font-medium"
                    : "hover:bg-muted/50",
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CARD_STAGE_META[stage].color }}
                />
                {CARD_STAGE_META[stage].label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Loop type pills */}
      <div className="flex items-center gap-1.5">
        {LOOP_ORDER.map((lt) => {
          const meta = LOOP_META[lt];
          const Icon = meta.icon;
          const isActive = filters.loopType === lt;
          return (
            <Button
              key={lt}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs",
                isActive && "bg-primary text-primary-foreground",
              )}
              onClick={() => handleLoopTypeSelect(lt)}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </Button>
          );
        })}
      </div>

      {/* Active filter indicator + clear */}
      {activeCount > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {activeCount} filter{activeCount > 1 ? "s" : ""}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={handleClearAll}
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
