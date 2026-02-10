import { describe, expect, it } from "vitest";
import {
  getPartLinkIds,
  normalizePartLinkId,
  partMatchesLinkId,
  resolvePartLinkedValue,
} from "@/lib/part-linking";

describe("part-linking", () => {
  describe("normalizePartLinkId", () => {
    it("normalizes by trimming and lowercasing", () => {
      expect(normalizePartLinkId("  ABC-123  ")).toBe("abc-123");
    });

    it("returns null for empty or non-string input", () => {
      expect(normalizePartLinkId("   ")).toBeNull();
      expect(normalizePartLinkId(undefined)).toBeNull();
      expect(normalizePartLinkId(null)).toBeNull();
    });
  });

  describe("getPartLinkIds", () => {
    it("returns all unique normalized link ids", () => {
      const part = {
        id: "PART-001",
        eId: "part-001",
        externalGuid: "  EXT-001  ",
      };

      expect(getPartLinkIds(part)).toEqual(["part-001", "ext-001"]);
    });
  });

  describe("resolvePartLinkedValue", () => {
    it("resolves by primary id", () => {
      const map = new Map<string, number>([["part-100", 42]]);
      const part = { id: "PART-100", eId: null, externalGuid: null };

      expect(resolvePartLinkedValue(part, map)).toBe(42);
    });

    it("resolves by fallback identifiers when id is not present", () => {
      const map = new Map<string, string>([["legacy-id-7", "linked"]]);
      const part = { id: "part-7", eId: "legacy-id-7", externalGuid: null };

      expect(resolvePartLinkedValue(part, map)).toBe("linked");
    });

    it("returns undefined when no identifier matches", () => {
      const map = new Map<string, string>([["part-9", "x"]]);
      const part = { id: "part-1", eId: "legacy-1", externalGuid: "ext-1" };

      expect(resolvePartLinkedValue(part, map)).toBeUndefined();
    });
  });

  describe("partMatchesLinkId", () => {
    it("matches against id, eId, and externalGuid", () => {
      const part = { id: "part-abc", eId: "legacy-abc", externalGuid: "ext-abc" };

      expect(partMatchesLinkId(part, "PART-ABC")).toBe(true);
      expect(partMatchesLinkId(part, "legacy-abc")).toBe(true);
      expect(partMatchesLinkId(part, "ext-abc")).toBe(true);
    });

    it("does not match unknown ids", () => {
      const part = { id: "part-abc", eId: "legacy-abc", externalGuid: null };

      expect(partMatchesLinkId(part, "part-zzz")).toBe(false);
      expect(partMatchesLinkId(part, "")).toBe(false);
    });
  });
});
