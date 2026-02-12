import * as React from "react";
import { fetchKpiAggregates, fetchKpiTrend } from "@/lib/api-client";
import type { KpiValue, KpiTrendData, TrendPeriod } from "@/types/analytics";

interface UseKpiAggregatesResult {
  data: KpiValue[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useKpiAggregates(token: string | null): UseKpiAggregatesResult {
  const [data, setData] = React.useState<KpiValue[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchKpiAggregates(token);
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch KPI aggregates"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

interface UseKpiTrendResult {
  data: KpiTrendData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useKpiTrend(
  token: string | null,
  kpiId: string,
  period: TrendPeriod,
  facilityIds?: string[],
): UseKpiTrendResult {
  const [data, setData] = React.useState<KpiTrendData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchKpiTrend(token, kpiId, period, facilityIds);
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch KPI trend"));
    } finally {
      setLoading(false);
    }
  }, [token, kpiId, period, facilityIds]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
