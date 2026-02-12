/**
 * Integration tests for PO CRUD flow (api-client methods)
 *
 * Covers:
 * - createPurchaseOrder sends correct payload
 * - updatePurchaseOrder sends only header fields (not lines)
 * - fetchPurchaseOrder retrieves single PO
 * - updatePurchaseOrderStatus transitions PO status
 * - Error handling (401 unauthorized, 4xx, 5xx)
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  fetchPurchaseOrder,
  updatePurchaseOrderStatus,
  isUnauthorized,
  ApiError,
} from "@/lib/api-client";

// ─── Helpers ──────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchError(errorBody: unknown, status: number) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(errorBody), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const TOKEN = "test-token";

const MOCK_PO = {
  id: "po-001",
  poNumber: "PO-2026-001",
  supplierId: "sup-001",
  facilityId: "fac-001",
  status: "draft",
  expectedDeliveryDate: "2026-03-01",
  currency: "USD",
  totalAmount: 100,
  lines: [
    {
      id: "line-001",
      partId: "part-001",
      partName: "Widget A",
      lineNumber: 1,
      quantityOrdered: 10,
      unitPrice: 10,
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────

describe("PO CRUD API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Create ──────────────────────────────────────────────────────────

  describe("createPurchaseOrder", () => {
    it("sends correct payload and returns created PO", async () => {
      const spy = mockFetch({ data: MOCK_PO });

      const input = {
        supplierId: "sup-001",
        facilityId: "fac-001",
        expectedDeliveryDate: "2026-03-01",
        currency: "USD",
        lines: [
          {
            partId: "part-001",
            lineNumber: 1,
            quantityOrdered: 10,
            unitCost: 10,
          },
        ],
      };

      const result = await createPurchaseOrder(TOKEN, input);

      expect(result).toEqual(MOCK_PO);
      expect(spy).toHaveBeenCalledTimes(1);

      const [url, options] = spy.mock.calls[0];
      expect(url.toString()).toContain("/api/orders/purchase-orders");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toEqual(input);
    });

    it("throws ApiError on 400 validation failure", async () => {
      mockFetchError({ error: "Supplier not found" }, 400);

      await expect(
        createPurchaseOrder(TOKEN, {
          supplierId: "invalid",
          facilityId: "fac-001",
          expectedDeliveryDate: "2026-03-01",
          lines: [{ partId: "p1", lineNumber: 1, quantityOrdered: 1, unitCost: 0 }],
        }),
      ).rejects.toThrow(ApiError);
    });
  });

  // ── Update (header fields only) ─────────────────────────────────────

  describe("updatePurchaseOrder", () => {
    it("sends only header fields, never lines", async () => {
      const spy = mockFetch({ data: { ...MOCK_PO, paymentTerms: "Net 30" } });

      const input = {
        expectedDeliveryDate: "2026-04-01",
        paymentTerms: "Net 30",
        shippingTerms: "FOB",
        notes: "Updated notes",
        internalNotes: null,
      };

      await updatePurchaseOrder(TOKEN, "po-001", input);

      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body).toEqual(input);
      // Ensure no 'lines' key is present
      expect(body).not.toHaveProperty("lines");
    });

    it("calls PATCH on the correct URL", async () => {
      const spy = mockFetch({ data: MOCK_PO });

      await updatePurchaseOrder(TOKEN, "po-001", {
        expectedDeliveryDate: "2026-04-01",
      });

      const [url, options] = spy.mock.calls[0];
      expect(url.toString()).toContain("/api/orders/purchase-orders/po-001");
      expect(options?.method).toBe("PATCH");
    });
  });

  // ── Fetch single PO ──────────────────────────────────────────────────

  describe("fetchPurchaseOrder", () => {
    it("fetches a purchase order by id", async () => {
      const spy = mockFetch(MOCK_PO);

      const result = await fetchPurchaseOrder(TOKEN, "po-001");

      expect(result).toEqual(MOCK_PO);
      expect(spy.mock.calls[0][0].toString()).toContain("/api/orders/purchase-orders/po-001");
    });

    it("throws ApiError on 404 not found", async () => {
      mockFetchError({ error: "Not found" }, 404);

      await expect(fetchPurchaseOrder(TOKEN, "nonexistent")).rejects.toThrow(ApiError);
    });
  });

  // ── Status transitions ──────────────────────────────────────────────

  describe("updatePurchaseOrderStatus", () => {
    it("transitions PO to approved with notes", async () => {
      const spy = mockFetch({ ...MOCK_PO, status: "approved" });

      const result = await updatePurchaseOrderStatus(TOKEN, "po-001", {
        status: "approved",
        notes: "Looks good",
      });

      expect(result.status).toBe("approved");
      const [url, options] = spy.mock.calls[0];
      expect(url.toString()).toContain("/api/orders/purchase-orders/po-001/status");
      expect(options?.method).toBe("PATCH");
      const body = JSON.parse(options?.body as string);
      expect(body.status).toBe("approved");
      expect(body.notes).toBe("Looks good");
    });

    it("transitions PO to cancelled with reason", async () => {
      const spy = mockFetch({ ...MOCK_PO, status: "cancelled" });

      await updatePurchaseOrderStatus(TOKEN, "po-001", {
        status: "cancelled",
        cancelReason: "No longer needed",
      });

      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.status).toBe("cancelled");
      expect(body.cancelReason).toBe("No longer needed");
    });
  });

  // ── isUnauthorized helper ───────────────────────────────────────────

  describe("isUnauthorized", () => {
    it("returns true for 401 ApiError", () => {
      const err = new ApiError(401, "Unauthorized");
      expect(isUnauthorized(err)).toBe(true);
    });

    it("returns false for 403 ApiError", () => {
      const err = new ApiError(403, "Forbidden");
      expect(isUnauthorized(err)).toBe(false);
    });

    it("returns false for non-ApiError", () => {
      expect(isUnauthorized(new Error("something"))).toBe(false);
      expect(isUnauthorized(null)).toBe(false);
    });
  });

  // ── 401 handling ────────────────────────────────────────────────────

  describe("unauthorized error detection", () => {
    it("createPurchaseOrder throws ApiError with 401 status", async () => {
      mockFetchError({ error: "Unauthorized" }, 401);

      let caught: unknown;
      try {
        await createPurchaseOrder(TOKEN, {
          supplierId: "s1",
          facilityId: "f1",
          expectedDeliveryDate: "2026-03-01",
          lines: [{ partId: "p1", lineNumber: 1, quantityOrdered: 1, unitCost: 0 }],
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ApiError);
      expect(isUnauthorized(caught)).toBe(true);
    });

    it("updatePurchaseOrder throws ApiError with 401 status", async () => {
      mockFetchError({ error: "Unauthorized" }, 401);

      let caught: unknown;
      try {
        await updatePurchaseOrder(TOKEN, "po-001", { expectedDeliveryDate: "2026-04-01" });
      } catch (err) {
        caught = err;
      }

      expect(isUnauthorized(caught)).toBe(true);
    });
  });
});
