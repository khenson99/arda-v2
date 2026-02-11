import { describe, expect, it } from "vitest";
import {
  normalizeProcurementOrderMethod,
  procurementOrderMethodLabel,
} from "./order-method";

describe("normalizeProcurementOrderMethod", () => {
  it("maps aliases to strict enum", () => {
    expect(normalizeProcurementOrderMethod("po")).toBe("purchase_order");
    expect(normalizeProcurementOrderMethod("E-Mail")).toBe("email");
    expect(normalizeProcurementOrderMethod("3rd-party")).toBe("third_party");
  });

  it("throws for unknown value", () => {
    expect(() => normalizeProcurementOrderMethod("fax")).toThrow(
      "Unsupported procurement order method",
    );
  });
});

describe("procurementOrderMethodLabel", () => {
  it("returns readable labels", () => {
    expect(procurementOrderMethodLabel("purchase_order")).toBe("Purchase Order");
    expect(procurementOrderMethodLabel("rfq")).toBe("RFQ");
  });
});
