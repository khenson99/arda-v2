import { useState, useEffect, useCallback, useRef } from "react";
import {
  isUnauthorized,
  parseApiError,
  fetchWorkOrder,
  updateWorkOrderStatus,
  updateWorkOrderRoutingStep,
  reportWorkOrderProduction,
} from "@/lib/api-client";
import type { WorkOrderDetail, WOStatus, RoutingStepStatus } from "@/types";

interface UseWorkOrderDetailOptions {
  token: string;
  woId: string;
  onUnauthorized: () => void;
}

export function useWorkOrderDetail({
  token,
  woId,
  onUnauthorized,
}: UseWorkOrderDetailOptions) {
  const [wo, setWo] = useState<WorkOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const isMountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadWo = useCallback(async () => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const raw = await fetchWorkOrder(token, woId);
      if (id !== fetchIdRef.current || !isMountedRef.current) return;
      const data =
        raw && typeof raw === "object" && "data" in raw
          ? (raw as unknown as { data: WorkOrderDetail }).data
          : raw;
      setWo(data);
    } catch (err) {
      if (id !== fetchIdRef.current || !isMountedRef.current) return;
      if (isUnauthorized(err)) {
        onUnauthorized();
        return;
      }
      setError(parseApiError(err));
    } finally {
      if (id === fetchIdRef.current && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [token, woId, onUnauthorized]);

  useEffect(() => {
    loadWo();
  }, [loadWo]);

  const updateStatus = useCallback(
    async (
      status: WOStatus,
      opts?: { holdReason?: string; holdNotes?: string; cancelReason?: string; notes?: string },
    ): Promise<boolean> => {
      if (!wo) return false;
      setStatusUpdating(true);
      try {
        const raw = await updateWorkOrderStatus(token, wo.id, { status, ...opts });
        if (!isMountedRef.current) return false;
        const updated =
          raw && typeof raw === "object" && "data" in raw
            ? (raw as unknown as { data: WorkOrderDetail }).data
            : raw;
        setWo(updated);
        return true;
      } catch (err) {
        if (!isMountedRef.current) return false;
        if (isUnauthorized(err)) {
          onUnauthorized();
          return false;
        }
        throw err;
      } finally {
        if (isMountedRef.current) setStatusUpdating(false);
      }
    },
    [token, wo, onUnauthorized],
  );

  const updateRoutingStep = useCallback(
    async (
      routingId: string,
      input: { status?: RoutingStepStatus; actualMinutes?: number; notes?: string },
    ): Promise<boolean> => {
      if (!wo) return false;
      try {
        const raw = await updateWorkOrderRoutingStep(token, wo.id, routingId, input);
        if (!isMountedRef.current) return false;
        const updated =
          raw && typeof raw === "object" && "data" in raw
            ? (raw as unknown as { data: WorkOrderDetail }).data
            : raw;
        setWo(updated);
        return true;
      } catch (err) {
        if (!isMountedRef.current) return false;
        if (isUnauthorized(err)) {
          onUnauthorized();
          return false;
        }
        throw err;
      }
    },
    [token, wo, onUnauthorized],
  );

  const reportProduction = useCallback(
    async (input: { quantityProduced: number; quantityRejected?: number }): Promise<boolean> => {
      if (!wo) return false;
      try {
        const raw = await reportWorkOrderProduction(token, wo.id, input);
        if (!isMountedRef.current) return false;
        const updated =
          raw && typeof raw === "object" && "data" in raw
            ? (raw as unknown as { data: WorkOrderDetail }).data
            : raw;
        setWo(updated);
        return true;
      } catch (err) {
        if (!isMountedRef.current) return false;
        if (isUnauthorized(err)) {
          onUnauthorized();
          return false;
        }
        throw err;
      }
    },
    [token, wo, onUnauthorized],
  );

  return {
    wo,
    loading,
    error,
    statusUpdating,
    updateStatus,
    updateRoutingStep,
    reportProduction,
    refresh: loadWo,
  };
}
