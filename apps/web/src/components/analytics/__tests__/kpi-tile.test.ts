import { describe, it, expect } from "vitest";
import type { KpiValue } from "@/types/analytics";

/**
 * Tests for KPI tile threshold and delta logic
 */
describe("KPI Tile Logic", () => {
  describe("Threshold violation detection", () => {
    it("should detect threshold violation for positive-is-good metrics (fill_rate)", () => {
      const kpi: KpiValue = {
        kpiId: "fill_rate",
        value: 92,
        unit: "%",
        delta: -3,
        deltaPercent: -3.16,
        threshold: 95,
        isNegativeGood: false,
        sparklineData: [],
        lastUpdated: "2026-02-11T00:00:00Z",
      };

      const isViolated = kpi.threshold !== null && kpi.value < kpi.threshold;
      expect(isViolated).toBe(true);
    });

    it("should not detect threshold violation when above threshold for positive-is-good metrics", () => {
      const kpi: KpiValue = {
        kpiId: "fill_rate",
        value: 97,
        unit: "%",
        delta: 2,
        deltaPercent: 2.1,
        threshold: 95,
        isNegativeGood: false,
        sparklineData: [],
        lastUpdated: "2026-02-11T00:00:00Z",
      };

      const isViolated = kpi.threshold !== null && kpi.value < kpi.threshold;
      expect(isViolated).toBe(false);
    });

    it("should detect threshold violation for negative-is-good metrics (stockout_count)", () => {
      const kpi: KpiValue = {
        kpiId: "stockout_count",
        value: 8,
        unit: "incidents",
        delta: 3,
        deltaPercent: 60,
        threshold: 5,
        isNegativeGood: true,
        sparklineData: [],
        lastUpdated: "2026-02-11T00:00:00Z",
      };

      const isViolated = kpi.threshold !== null && kpi.value > kpi.threshold;
      expect(isViolated).toBe(true);
    });

    it("should not detect threshold violation when below threshold for negative-is-good metrics", () => {
      const kpi: KpiValue = {
        kpiId: "stockout_count",
        value: 3,
        unit: "incidents",
        delta: -2,
        deltaPercent: -40,
        threshold: 5,
        isNegativeGood: true,
        sparklineData: [],
        lastUpdated: "2026-02-11T00:00:00Z",
      };

      const isViolated = kpi.threshold !== null && kpi.value > kpi.threshold;
      expect(isViolated).toBe(false);
    });
  });

  describe("Delta direction color logic", () => {
    it("should show positive delta as good for positive-is-good metrics", () => {
      const kpi: KpiValue = {
        kpiId: "fill_rate",
        value: 97,
        unit: "%",
        delta: 2,
        deltaPercent: 2.1,
        threshold: 95,
        isNegativeGood: false,
        sparklineData: [],
        lastUpdated: "2026-02-11T00:00:00Z",
      };

      const isPositiveDelta = kpi.delta > 0;
      const shouldBeGreen = !kpi.isNegativeGood && isPositiveDelta;
      expect(shouldBeGreen).toBe(true);
    });

    it("should show negative delta as bad for positive-is-good metrics", () => {
      const kpi: KpiValue = {
        kpiId: "fill_rate",
        value: 92,
        unit: "%",
        delta: -3,
        deltaPercent: -3.16,
        threshold: 95,
        isNegativeGood: false,
        sparklineData: [],
        lastUpdated: "2026-02-11T00:00:00Z",
      };

      const isPositiveDelta = kpi.delta > 0;
      const shouldBeWarning = !kpi.isNegativeGood && !isPositiveDelta;
      expect(shouldBeWarning).toBe(true);
    });

    it("should show positive delta as bad for negative-is-good metrics (stockout_count)", () => {
      const kpi: KpiValue = {
        kpiId: "stockout_count",
        value: 8,
        unit: "incidents",
        delta: 3,
        deltaPercent: 60,
        threshold: 5,
        isNegativeGood: true,
        sparklineData: [],
        lastUpdated: "2026-02-11T00:00:00Z",
      };

      const isPositiveDelta = kpi.delta > 0;
      const shouldBeWarning = kpi.isNegativeGood && isPositiveDelta;
      expect(shouldBeWarning).toBe(true);
    });

    it("should show negative delta as good for negative-is-good metrics (avg_cycle_time)", () => {
      const kpi: KpiValue = {
        kpiId: "avg_cycle_time",
        value: 65,
        unit: "hrs",
        delta: -7,
        deltaPercent: -9.72,
        threshold: 72,
        isNegativeGood: true,
        sparklineData: [],
        lastUpdated: "2026-02-11T00:00:00Z",
      };

      const isPositiveDelta = kpi.delta > 0;
      const shouldBeGreen = kpi.isNegativeGood && !isPositiveDelta;
      expect(shouldBeGreen).toBe(true);
    });

    it("should handle zero delta as neutral", () => {
      const kpi: KpiValue = {
        kpiId: "fill_rate",
        value: 95,
        unit: "%",
        delta: 0,
        deltaPercent: 0,
        threshold: 95,
        isNegativeGood: false,
        sparklineData: [],
        lastUpdated: "2026-02-11T00:00:00Z",
      };

      const isNeutral = kpi.delta === 0;
      expect(isNeutral).toBe(true);
    });
  });

  describe("procurement_manager role-scoped visibility", () => {
    it("should only show fill_rate and supplier_otd for procurement_manager", () => {
      const allKpis: KpiValue[] = [
        {
          kpiId: "fill_rate",
          value: 95,
          unit: "%",
          delta: 0,
          deltaPercent: 0,
          threshold: 95,
          isNegativeGood: false,
          sparklineData: [],
          lastUpdated: "2026-02-11T00:00:00Z",
        },
        {
          kpiId: "supplier_otd",
          value: 92,
          unit: "%",
          delta: 1,
          deltaPercent: 1.1,
          threshold: 90,
          isNegativeGood: false,
          sparklineData: [],
          lastUpdated: "2026-02-11T00:00:00Z",
        },
        {
          kpiId: "stockout_count",
          value: 3,
          unit: "incidents",
          delta: -2,
          deltaPercent: -40,
          threshold: 5,
          isNegativeGood: true,
          sparklineData: [],
          lastUpdated: "2026-02-11T00:00:00Z",
        },
        {
          kpiId: "avg_cycle_time",
          value: 65,
          unit: "hrs",
          delta: -7,
          deltaPercent: -9.72,
          threshold: 72,
          isNegativeGood: true,
          sparklineData: [],
          lastUpdated: "2026-02-11T00:00:00Z",
        },
        {
          kpiId: "order_accuracy",
          value: 99,
          unit: "%",
          delta: 1,
          deltaPercent: 1.02,
          threshold: 98,
          isNegativeGood: false,
          sparklineData: [],
          lastUpdated: "2026-02-11T00:00:00Z",
        },
      ];

      const visibleForProcurement = allKpis.filter(
        (kpi) => kpi.kpiId === "fill_rate" || kpi.kpiId === "supplier_otd",
      );

      expect(visibleForProcurement).toHaveLength(2);
      expect(visibleForProcurement.map((k) => k.kpiId)).toEqual(["fill_rate", "supplier_otd"]);
    });
  });
});
