import type { ProcurementOrderMethod } from "@/types";

export interface ConfigValidationInput {
  recipientEmail: string;
  thirdPartyInstructions: string;
  supplierContactPhone: string;
  lines: Array<{
    quantityOrdered: number;
    orderMethod: ProcurementOrderMethod | null;
    sourceUrl: string;
  }>;
}

export function validateVendorOrderConfig(input: ConfigValidationInput): Record<string, string> {
  const nextErrors: Record<string, string> = {};
  const methods = new Set<ProcurementOrderMethod>();

  input.lines.forEach((line) => {
    if (line.orderMethod) {
      methods.add(line.orderMethod);
    }
  });

  if (
    (methods.has("email") || methods.has("purchase_order") || methods.has("rfq")) &&
    !input.recipientEmail.trim()
  ) {
    nextErrors.recipientEmail = "Recipient email is required for email-based methods.";
  }

  if (methods.has("third_party") && !input.thirdPartyInstructions.trim()) {
    nextErrors.thirdPartyInstructions = "Third-party instructions are required.";
  }

  if (methods.has("phone") && !input.supplierContactPhone.trim()) {
    nextErrors.supplierContactPhone = "Supplier phone is missing for phone orders.";
  }

  input.lines.forEach((line, index) => {
    if (!line.orderMethod) {
      nextErrors[`line-${index}-orderMethod`] = "Select an order method.";
    }
    if (!Number.isFinite(line.quantityOrdered) || line.quantityOrdered <= 0) {
      nextErrors[`line-${index}-quantity`] = "Quantity must be greater than 0.";
    }

    const requiresSource = line.orderMethod === "online" || line.orderMethod === "shopping";
    if (requiresSource && !line.sourceUrl.trim()) {
      nextErrors[`line-${index}-sourceUrl`] = "Source URL is required for online/shopping.";
    }
  });

  return nextErrors;
}

export function isExecutionComplete(
  methods: ProcurementOrderMethod[],
  completedByMethod: Record<string, boolean>,
): boolean {
  return methods.every((method) => !!completedByMethod[method]);
}
