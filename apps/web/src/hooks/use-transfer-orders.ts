import { useState, useEffect, useCallback, useRef } from "react";
import {
  isUnauthorized,
  parseApiError,
  fetchTransferOrders,
  fetchTransferOrder,
  fetchTransferOrderTransitions,
  updateTransferOrderStatus,
  createTransferOrder,
  fetchFacilities,
  fetchSourceRecommendations,
  fetchTransferOrderAudit,
  fetchInventoryByFacility,
} from "@/lib/api-client";
import type {
  TransferOrder,
  TOStatus,
  FacilityRecord,
  SourceRecommendation,
  TransferAuditEntry,
  InventoryLedgerEntry,
} from "@/types";

/* ── Types ─────────────────────────────────────────────────────── */

export type TransferTab = "queue" | "transfer-queue" | "detail" | "new";

export interface CreateTransferInput {
  sourceFacilityId: string;
  destinationFacilityId: string;
  notes?: string;
  lines: Array<{
    partId: string;
    quantityRequested: number;
    notes?: string;
  }>;
}

/* ── Hook ──────────────────────────────────────────────────────── */

export function useTransferOrders(token: string, onUnauthorized: () => void) {
  /* ── Tab ────────────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState<TransferTab>("queue");

  /* ── Queue state ────────────────────────────────────────────── */
  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<TOStatus | "all">("all");

  /* ── Detail state ───────────────────────────────────────────── */
  const [selectedOrder, setSelectedOrder] = useState<TransferOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [validTransitions, setValidTransitions] = useState<TOStatus[]>([]);
  const [transitionsLoading, setTransitionsLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [auditEntries, setAuditEntries] = useState<TransferAuditEntry[]>([]);
  const [sourceInventory, setSourceInventory] = useState<InventoryLedgerEntry[]>([]);
  const [destinationInventory, setDestinationInventory] = useState<InventoryLedgerEntry[]>([]);

  /* ── Create state ───────────────────────────────────────────── */
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /* ── Facilities ─────────────────────────────────────────────── */
  const [facilities, setFacilities] = useState<FacilityRecord[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);

  /* ── Source recommendations ─────────────────────────────────── */
  const [sourceRecommendations, setSourceRecommendations] = useState<SourceRecommendation[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);

  /* ── Refs ────────────────────────────────────────────────────── */
  const isMountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* ── Load queue ─────────────────────────────────────────────── */

  const loadOrders = useCallback(
    async (page: number) => {
      const id = ++fetchIdRef.current;
      setOrdersLoading(true);
      setOrdersError(null);
      try {
        const statusParam = statusFilter !== "all" ? statusFilter : undefined;
        const res = await fetchTransferOrders(token, {
          page,
          pageSize: 20,
          status: statusParam,
        });
        if (id !== fetchIdRef.current || !isMountedRef.current) return;
        setOrders(res.data);
        setOrdersPage(res.pagination.page);
        setOrdersTotalPages(res.pagination.totalPages);
      } catch (err) {
        if (id !== fetchIdRef.current || !isMountedRef.current) return;
        if (isUnauthorized(err)) {
          onUnauthorized();
          return;
        }
        setOrdersError(parseApiError(err));
      } finally {
        if (id === fetchIdRef.current && isMountedRef.current) {
          setOrdersLoading(false);
        }
      }
    },
    [token, statusFilter, onUnauthorized],
  );

  /* Fetch on mount / filter change */
  useEffect(() => {
    loadOrders(1);
  }, [loadOrders]);

  const refreshOrders = useCallback(() => {
    loadOrders(ordersPage);
  }, [loadOrders, ordersPage]);

  /* ── Select order (opens detail) ────────────────────────────── */

  const selectOrder = useCallback(
    async (order: TransferOrder) => {
      setActiveTab("detail");
      setSelectedOrder(order);
      setDetailLoading(true);
      setDetailError(null);
      setValidTransitions([]);
      setAuditEntries([]);
      setSourceInventory([]);
      setDestinationInventory([]);

      try {
        const emptyInvPage = { data: [] as InventoryLedgerEntry[], pagination: { page: 1, pageSize: 200, total: 0, totalPages: 0 } };

        // Run all five requests in parallel — facility IDs are available from the order param
        const [detailRes, transRes, auditRes, sourceInvRes, destInvRes] = await Promise.all([
          fetchTransferOrder(token, order.id),
          fetchTransferOrderTransitions(token, order.id),
          fetchTransferOrderAudit(token, order.id),
          fetchInventoryByFacility(token, order.sourceFacilityId, { pageSize: 200 }).catch(() => emptyInvPage),
          fetchInventoryByFacility(token, order.destinationFacilityId, { pageSize: 200 }).catch(() => emptyInvPage),
        ]);
        if (!isMountedRef.current) return;

        setSelectedOrder(detailRes.data);
        setValidTransitions(transRes.data.validTransitions);
        setAuditEntries(auditRes.data);
        setSourceInventory(sourceInvRes.data);
        setDestinationInventory(destInvRes.data);
      } catch (err) {
        if (!isMountedRef.current) return;
        if (isUnauthorized(err)) {
          onUnauthorized();
          return;
        }
        setDetailError(parseApiError(err));
      } finally {
        if (isMountedRef.current) {
          setDetailLoading(false);
        }
      }
    },
    [token, onUnauthorized],
  );

  const clearSelectedOrder = useCallback(() => {
    setSelectedOrder(null);
    setDetailError(null);
    setValidTransitions([]);
    setAuditEntries([]);
    setSourceInventory([]);
    setDestinationInventory([]);
  }, []);

  /* ── Transition order ───────────────────────────────────────── */

  const transitionOrder = useCallback(
    async (status: TOStatus, reason?: string): Promise<boolean> => {
      if (!selectedOrder) return false;
      setTransitioning(true);
      try {
        const res = await updateTransferOrderStatus(token, selectedOrder.id, { status, reason });
        if (!isMountedRef.current) return false;
        setSelectedOrder(res.data);

        /* Reload transitions for the new status */
        setTransitionsLoading(true);
        try {
          const transRes = await fetchTransferOrderTransitions(token, selectedOrder.id);
          if (isMountedRef.current) {
            setValidTransitions(transRes.data.validTransitions);
          }
        } catch {
          /* Non-blocking */
        } finally {
          if (isMountedRef.current) setTransitionsLoading(false);
        }

        /* Refresh queue in background */
        loadOrders(ordersPage).catch(() => {});
        return true;
      } catch (err) {
        if (!isMountedRef.current) return false;
        if (isUnauthorized(err)) {
          onUnauthorized();
          return false;
        }
        throw err;
      } finally {
        if (isMountedRef.current) setTransitioning(false);
      }
    },
    [token, selectedOrder, ordersPage, loadOrders, onUnauthorized],
  );

  /* ── Load facilities ────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    setFacilitiesLoading(true);
    fetchFacilities(token, { pageSize: 200 })
      .then((res) => {
        if (!cancelled && isMountedRef.current) {
          setFacilities(res.data);
        }
      })
      .catch((err) => {
        if (!cancelled && isMountedRef.current && isUnauthorized(err)) {
          onUnauthorized();
        }
      })
      .finally(() => {
        if (!cancelled && isMountedRef.current) setFacilitiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, onUnauthorized]);

  /* ── Source recommendations ─────────────────────────────────── */

  const fetchRecommendations = useCallback(
    async (destinationFacilityId: string, partId: string) => {
      setRecommendationsLoading(true);
      setSourceRecommendations([]);
      try {
        const res = await fetchSourceRecommendations(token, {
          destinationFacilityId,
          partId,
        });
        if (isMountedRef.current) {
          setSourceRecommendations(res.data);
        }
      } catch (err) {
        if (isMountedRef.current && isUnauthorized(err)) {
          onUnauthorized();
        }
      } finally {
        if (isMountedRef.current) setRecommendationsLoading(false);
      }
    },
    [token, onUnauthorized],
  );

  /* ── Create order ───────────────────────────────────────────── */

  const createOrder = useCallback(
    async (input: CreateTransferInput): Promise<boolean> => {
      setCreating(true);
      setCreateError(null);
      try {
        await createTransferOrder(token, input);
        if (!isMountedRef.current) return false;
        setActiveTab("queue");
        loadOrders(1).catch(() => {});
        return true;
      } catch (err) {
        if (!isMountedRef.current) return false;
        if (isUnauthorized(err)) {
          onUnauthorized();
          return false;
        }
        setCreateError(parseApiError(err));
        return false;
      } finally {
        if (isMountedRef.current) setCreating(false);
      }
    },
    [token, loadOrders, onUnauthorized],
  );

  /* ── Return ─────────────────────────────────────────────────── */

  return {
    activeTab,
    setActiveTab,

    /* Queue */
    orders,
    ordersLoading,
    ordersError,
    ordersPage,
    ordersTotalPages,
    setOrdersPage: (page: number) => loadOrders(page),
    statusFilter,
    setStatusFilter,
    refreshOrders,
    selectOrder,

    /* Detail */
    selectedOrder,
    detailLoading,
    detailError,
    validTransitions,
    transitionsLoading,
    transitioning,
    transitionOrder,
    clearSelectedOrder,
    auditEntries,
    sourceInventory,
    destinationInventory,

    /* Create */
    facilities,
    facilitiesLoading,
    sourceRecommendations,
    recommendationsLoading,
    fetchRecommendations,
    createOrder,
    creating,
    createError,
  };
}
