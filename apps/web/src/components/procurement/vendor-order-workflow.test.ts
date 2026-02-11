import { describe, expect, it } from "vitest";
import { isExecutionComplete, validateVendorOrderConfig } from "./vendor-order-workflow";

describe("validateVendorOrderConfig", () => {
  it("blocks config when required method fields are missing", () => {
    const errors = validateVendorOrderConfig({
      recipientEmail: "",
      thirdPartyInstructions: "",
      supplierContactPhone: "",
      lines: [
        {
          quantityOrdered: 2,
          orderMethod: "email",
          sourceUrl: "",
        },
        {
          quantityOrdered: 1,
          orderMethod: "online",
          sourceUrl: "",
        },
      ],
    });

    expect(errors.recipientEmail).toBeTruthy();
    expect(errors["line-1-sourceUrl"]).toBeTruthy();
  });
});

describe("isExecutionComplete", () => {
  it("keeps verify disabled until every method is complete", () => {
    const methods = ["email", "online", "phone"] as const;

    expect(isExecutionComplete(methods as any, { email: true, online: true, phone: false })).toBe(false);
    expect(isExecutionComplete(methods as any, { email: true, online: true, phone: true })).toBe(true);
  });
});
