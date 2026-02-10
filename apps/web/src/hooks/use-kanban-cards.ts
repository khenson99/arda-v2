import * as React from "react";
import type { KanbanCard, CardStage, LoopType } from "@/types";
import { isUnauthorized, parseApiError, fetchCards } from "@/lib/api-client";

/* ── Filter state ───────────────────────────────────────────── */

export interface CardFilters {
  stage: CardStage | null;
  loopType: LoopType | null;
  search: string;
  page: number;
  pageSize: number;
}

const DEFAULT_FILTERS: CardFilters = {
  stage: null,
  loopType: null,
  search: "",
  page: 1,
  pageSize: 20,
};

/* ── Hook return type ───────────────────────────────────────── */

export interface UseKanbanCardsResult {
  cards: KanbanCard[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  isLoading: boolean;
  error: string | null;
  filters: CardFilters;
  setFilters: React.Dispatch<React.SetStateAction<CardFilters>>;
  refresh: () => Promise<void>;
}

/* ── Hook ────────────────────────────────────────────────────── */

export function useKanbanCards(
  token: string | null,
  onUnauthorized: () => void,
): UseKanbanCardsResult {
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [cards, setCards] = React.useState<KanbanCard[]>([]);
  const [pagination, setPagination] = React.useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<CardFilters>(DEFAULT_FILTERS);

  const load = React.useCallback(async () => {
    if (!token) {
      setCards([]);
      setPagination({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchCards(token, {
        stage: filters.stage ?? undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      });

      if (!isMountedRef.current) return;

      let data = result.data ?? [];

      // Client-side filtering for loopType (API may not support this filter)
      if (filters.loopType) {
        data = data.filter((c) => c.loopType === filters.loopType);
      }

      // Client-side search for card number or part name
      if (filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        data = data.filter(
          (c) =>
            String(c.cardNumber).includes(q) ||
            (c.partName && c.partName.toLowerCase().includes(q)),
        );
      }

      setCards(data);
      setPagination(result.pagination);
    } catch (err) {
      if (!isMountedRef.current) return;

      if (isUnauthorized(err)) {
        onUnauthorized();
        return;
      }

      setError(parseApiError(err));
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [token, filters.stage, filters.loopType, filters.search, filters.page, filters.pageSize, onUnauthorized]);

  // Reset to page 1 when filters change (except page itself)
  const prevFiltersRef = React.useRef(filters);
  React.useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.stage !== filters.stage ||
      prev.loopType !== filters.loopType ||
      prev.search !== filters.search ||
      prev.pageSize !== filters.pageSize
    ) {
      if (filters.page !== 1) {
        setFilters((f) => ({ ...f, page: 1 }));
      }
    }
    prevFiltersRef.current = filters;
  }, [filters]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return {
    cards,
    pagination,
    isLoading,
    error,
    filters,
    setFilters,
    refresh: load,
  };
}
