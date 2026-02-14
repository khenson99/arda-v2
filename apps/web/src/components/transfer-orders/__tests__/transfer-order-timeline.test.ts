import { describe, expect, it } from "vitest";
import { parseAuditEntries, formatDuration } from "../transfer-order-timeline";
import type { TransferAuditEntry } from "@/types";

/* ── helpers ────────────────────────────────────────────────────── */

function makeAudit(
  overrides: Partial<TransferAuditEntry> & { timestamp: string },
): TransferAuditEntry {
  return {
    id: crypto.randomUUID(),
    tenantId: "t1",
    userId: null,
    action: "transfer_order.status_changed",
    entityType: "transfer_order",
    entityId: "to-1",
    previousState: null,
    newState: { status: "draft" },
    metadata: {},
    ipAddress: null,
    userAgent: null,
    ...overrides,
  };
}

/* ── parseAuditEntries ──────────────────────────────────────────── */

describe("parseAuditEntries", () => {
  it("returns empty array for empty input", () => {
    expect(parseAuditEntries([])).toEqual([]);
  });

  it("orders entries ascending by timestamp", () => {
    const entries: TransferAuditEntry[] = [
      makeAudit({
        timestamp: "2025-03-02T12:00:00Z",
        action: "transfer_order.status_changed",
        previousState: { status: "requested" },
        newState: { status: "approved" },
      }),
      makeAudit({
        timestamp: "2025-03-01T10:00:00Z",
        action: "transfer_order.created",
        previousState: null,
        newState: { status: "draft" },
      }),
      makeAudit({
        timestamp: "2025-03-01T14:00:00Z",
        action: "transfer_order.status_changed",
        previousState: { status: "draft" },
        newState: { status: "requested" },
      }),
    ];

    const result = parseAuditEntries(entries);
    expect(result.map((r) => r.toStatus)).toEqual([
      "draft",
      "requested",
      "approved",
    ]);
  });

  it("filters out non-status events", () => {
    const entries: TransferAuditEntry[] = [
      makeAudit({
        timestamp: "2025-03-01T10:00:00Z",
        action: "transfer_order.created",
        newState: { status: "draft" },
      }),
      makeAudit({
        timestamp: "2025-03-01T11:00:00Z",
        action: "transfer_order.line_added",
        newState: { partId: "p1" },
      }),
    ];

    const result = parseAuditEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].toStatus).toBe("draft");
  });

  it("calculates duration between transitions", () => {
    const entries: TransferAuditEntry[] = [
      makeAudit({
        timestamp: "2025-03-01T10:00:00Z",
        action: "transfer_order.created",
        newState: { status: "draft" },
      }),
      makeAudit({
        timestamp: "2025-03-01T10:30:00Z",
        action: "transfer_order.status_changed",
        previousState: { status: "draft" },
        newState: { status: "requested" },
      }),
    ];

    const result = parseAuditEntries(entries);
    expect(result[0].durationMs).toBeNull(); // first entry has no previous
    expect(result[1].durationMs).toBe(30 * 60 * 1000); // 30 minutes
  });

  it("extracts reason from metadata", () => {
    const entries: TransferAuditEntry[] = [
      makeAudit({
        timestamp: "2025-03-01T10:00:00Z",
        action: "transfer_order.status_changed",
        previousState: { status: "approved" },
        newState: { status: "cancelled" },
        metadata: { reason: "No longer needed" },
      }),
    ];

    const result = parseAuditEntries(entries);
    expect(result[0].reason).toBe("No longer needed");
  });

  it("handles cancelled status correctly", () => {
    const entries: TransferAuditEntry[] = [
      makeAudit({
        timestamp: "2025-03-01T10:00:00Z",
        action: "transfer_order.created",
        newState: { status: "draft" },
      }),
      makeAudit({
        timestamp: "2025-03-01T11:00:00Z",
        action: "transfer_order.status_changed",
        previousState: { status: "draft" },
        newState: { status: "cancelled" },
      }),
    ];

    const result = parseAuditEntries(entries);
    expect(result[1].toStatus).toBe("cancelled");
    expect(result[1].fromStatus).toBe("draft");
  });
});

/* ── formatDuration ─────────────────────────────────────────────── */

describe("formatDuration", () => {
  it("returns em-dash for null", () => {
    expect(formatDuration(null)).toBe("—");
  });

  it('returns "0s" for 0ms', () => {
    expect(formatDuration(0)).toBe("0s");
  });

  it("formats sub-minute durations as seconds", () => {
    expect(formatDuration(5_000)).toBe("5s");
    expect(formatDuration(59_000)).toBe("59s");
  });

  it("formats minute-range durations", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(90_000)).toBe("1m"); // 1.5 min → floor to 1m
    expect(formatDuration(5 * 60 * 1000)).toBe("5m");
  });

  it("formats hour-range durations as hours + minutes", () => {
    expect(formatDuration(3600_000)).toBe("1h 0m");
    expect(formatDuration(3600_000 + 30 * 60_000)).toBe("1h 30m");
  });

  it("formats day-range durations as days + hours", () => {
    const oneDay = 24 * 3600_000;
    expect(formatDuration(oneDay)).toBe("1d 0h");
    expect(formatDuration(oneDay + 5 * 3600_000)).toBe("1d 5h");
    expect(formatDuration(3 * oneDay + 12 * 3600_000)).toBe("3d 12h");
  });
});
