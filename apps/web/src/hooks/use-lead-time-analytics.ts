import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchLeadTimeSummary,
  fetchLeadTimeTrend,
  isUnauthorized,
  parseApiError,
} from "@/lib/api-client";
import type {
  LeadTimeSummaryRow,
  LeadTimeTrendPoint,
  LeadTimeFilters,
} from "@/types";

/* ── Hook ──────────────────────────────────────────────────────── */

export function useLeadTimeAnalytics(token: string, onUnauthorized: () => void) {
  /* ── Summary state ────────────────────────────────────────────── */
  const [summary, setSummary] = useState<LeadTimeSummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryTotalPages, setSummaryTotalPages] = useState(1);

  /* ── Trend state ──────────────────────────────────────────────── */
  const [trend, setTrend] = useState<LeadTimeTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState<string | null>(null);

  /* ── Filters state ────────────────────────────────────────────── */
  const [filters, setFilters] = useState<LeadTimeFilters>({
    dateFrom: undefined,
    dateTo: undefined,
    sourceFacilityId: undefined,
    destinationFacilityId: undefined,
    partId: undefined,
  });

  /* ── Refs ────────────────────────────────────────────────────── */
  const isMountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* ── Load summary ─────────────────────────────────────────────── */

  const loadSummary = useCallback(
    async (page: number) => {
      const id = ++fetchIdRef.current;
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const res = await fetchLeadTimeSummary(token, {
          page,
          pageSize: 20,
          ...filters,
        });
        if (id !== fetchIdRef.current || !isMountedRef.current) return;
        setSummary(res.data);
        setSummaryPage(res.pagination.page);
        setSummaryTotalPages(res.pagination.totalPages);
      } catch (err) {
        if (id !== fetchIdRef.current || !isMountedRef.current) return;
        if (isUnauthorized(err)) {
          onUnauthorized();
          return;
        }
        setSummaryError(parseApiError(err));
      } finally {
        if (id === fetchIdRef.current && isMountedRef.current) {
          setSummaryLoading(false);
        }
      }
    },
    [token, filters, onUnauthorized],
  );

  /* ── Load trend ───────────────────────────────────────────────── */

  const loadTrend = useCallback(async () => {
    const id = ++fetchIdRef.current;
    setTrendLoading(true);
    setTrendError(null);
    try {
      const res = await fetchLeadTimeTrend(token, filters);
      if (id !== fetchIdRef.current || !isMountedRef.current) return;
      setTrend(res.data);
    } catch (err) {
      if (id !== fetchIdRef.current || !isMountedRef.current) return;
      if (isUnauthorized(err)) {
        onUnauthorized();
        return;
      }
      setTrendError(parseApiError(err));
    } finally {
      if (id === fetchIdRef.current && isMountedRef.current) {
        setTrendLoading(false);
      }
    }
  }, [token, filters, onUnauthorized]);

  /* ── Load on mount / filter change ────────────────────────────── */

  useEffect(() => {
    loadSummary(1);
    loadTrend();
  }, [loadSummary, loadTrend]);

  /* ── Refresh ─────────────────────────────────────────────────── */

  const refresh = useCallback(() => {
    loadSummary(summaryPage);
    loadTrend();
  }, [loadSummary, loadTrend, summaryPage]);

  /* ── Update filters ──────────────────────────────────────────── */

  const updateFilters = useCallback((newFilters: Partial<LeadTimeFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      dateFrom: undefined,
      dateTo: undefined,
      sourceFacilityId: undefined,
      destinationFacilityId: undefined,
      partId: undefined,
    });
  }, []);

  /* ── Return ─────────────────────────────────────────────────── */

  return {
    /* Summary */
    summary,
    summaryLoading,
    summaryError,
    summaryPage,
    summaryTotalPages,
    setSummaryPage: (page: number) => loadSummary(page),

    /* Trend */
    trend,
    trendLoading,
    trendError,

    /* Filters */
    filters,
    updateFilters,
    clearFilters,

    /* Actions */
    refresh,
  };
}
