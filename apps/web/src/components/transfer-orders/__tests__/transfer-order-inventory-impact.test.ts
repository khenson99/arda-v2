import { describe, expect, it } from "vitest";
import { calculateLineImpacts } from "../transfer-order-inventory-impact";
import type { TransferOrderLine, InventoryLedgerEntry } from "@/types";

/* ── helpers ────────────────────────────────────────────────────── */

function makeLine(overrides: Partial<TransferOrderLine> = {}): TransferOrderLine {
  return {
    id: "line-1",
    transferOrderId: "to-1",
    partId: "part-1",
    partName: "Widget A",
    quantityRequested: 10,
    quantityShipped: 0,
    quantityReceived: 0,
    notes: null,
    ...overrides,
  };
}

function makeInventory(
  overrides: Partial<InventoryLedgerEntry> & { partId: string },
): InventoryLedgerEntry {
  return {
    id: "inv-1",
    tenantId: "t1",
    facilityId: "fac-1",
    partId: overrides.partId,
    partName: "Widget A",
    qtyOnHand: 100,
    qtyReserved: 0,
    qtyInTransit: 0,
    reorderPoint: 10,
    reorderQty: 50,
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

/* ── calculateLineImpacts ──────────────────────────────────────── */

describe("calculateLineImpacts", () => {
  it("returns empty array for no lines", () => {
    expect(calculateLineImpacts([], [], [])).toEqual([]);
  });

  it("calculates source after-ship quantity correctly", () => {
    const lines = [makeLine({ partId: "p1", quantityShipped: 5 })];
    const sourceInv = [makeInventory({ partId: "p1", qtyOnHand: 100 })];

    const result = calculateLineImpacts(lines, sourceInv, []);
    expect(result[0].sourceCurrentQty).toBe(100);
    expect(result[0].sourceAfterShipQty).toBe(95); // 100 - 5
  });

  it("calculates destination after-receive quantity correctly", () => {
    const lines = [makeLine({ partId: "p1", quantityReceived: 8 })];
    const destInv = [makeInventory({ partId: "p1", qtyOnHand: 20 })];

    const result = calculateLineImpacts(lines, [], destInv);
    expect(result[0].destCurrentQty).toBe(20);
    expect(result[0].destAfterReceiveQty).toBe(28); // 20 + 8
  });

  it("returns null quantities when inventory data is missing", () => {
    const lines = [makeLine({ partId: "p1" })];

    const result = calculateLineImpacts(lines, [], []);
    expect(result[0].sourceCurrentQty).toBeNull();
    expect(result[0].sourceAfterShipQty).toBeNull();
    expect(result[0].destCurrentQty).toBeNull();
    expect(result[0].destAfterReceiveQty).toBeNull();
  });

  it("handles mixed inventory availability across lines", () => {
    const lines = [
      makeLine({ id: "l1", partId: "p1", quantityShipped: 3, quantityReceived: 3 }),
      makeLine({ id: "l2", partId: "p2", quantityShipped: 2, quantityReceived: 0 }),
    ];
    const sourceInv = [makeInventory({ partId: "p1", qtyOnHand: 50 })];
    const destInv = [makeInventory({ partId: "p2", qtyOnHand: 10 })];

    const result = calculateLineImpacts(lines, sourceInv, destInv);

    // p1: source available, dest not
    expect(result[0].sourceCurrentQty).toBe(50);
    expect(result[0].sourceAfterShipQty).toBe(47);
    expect(result[0].destCurrentQty).toBeNull();
    expect(result[0].destAfterReceiveQty).toBeNull();

    // p2: source not available, dest available
    expect(result[1].sourceCurrentQty).toBeNull();
    expect(result[1].sourceAfterShipQty).toBeNull();
    expect(result[1].destCurrentQty).toBe(10);
    expect(result[1].destAfterReceiveQty).toBe(10); // 10 + 0 received
  });

  it("handles zero shipped/received quantities", () => {
    const lines = [makeLine({ partId: "p1", quantityShipped: 0, quantityReceived: 0 })];
    const sourceInv = [makeInventory({ partId: "p1", qtyOnHand: 50 })];
    const destInv = [makeInventory({ partId: "p1", qtyOnHand: 30 })];

    const result = calculateLineImpacts(lines, sourceInv, destInv);
    expect(result[0].sourceAfterShipQty).toBe(50); // 50 - 0
    expect(result[0].destAfterReceiveQty).toBe(30); // 30 + 0
  });

  it("preserves partName from the line", () => {
    const lines = [
      makeLine({ partId: "p1", partName: "Widget A" }),
      makeLine({ id: "l2", partId: "p2", partName: undefined }),
    ];

    const result = calculateLineImpacts(lines, [], []);
    expect(result[0].partName).toBe("Widget A");
    expect(result[1].partName).toBeNull();
  });
});
