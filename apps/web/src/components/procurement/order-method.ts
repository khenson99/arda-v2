import type { ProcurementOrderMethod } from "@/types";

const ORDER_METHOD_MAP: Record<string, ProcurementOrderMethod> = {
  email: "email",
  "e-mail": "email",
  mail: "email",
  online: "online",
  web: "online",
  website: "online",
  portal: "online",
  ecommerce: "online",
  "e-commerce": "online",
  purchase_order: "purchase_order",
  "purchase-order": "purchase_order",
  purchaseorder: "purchase_order",
  po: "purchase_order",
  shopping: "shopping",
  shop: "shopping",
  cart: "shopping",
  rfq: "rfq",
  requestforquote: "rfq",
  request_for_quote: "rfq",
  request_forquotation: "rfq",
  third_party: "third_party",
  "third-party": "third_party",
  thirdparty: "third_party",
  "3rd_party": "third_party",
  "3rd-party": "third_party",
  "3rdparty": "third_party",
  phone: "phone",
  call: "phone",
  telephone: "phone",
};

export const PROCUREMENT_ORDER_METHODS: ProcurementOrderMethod[] = [
  "email",
  "online",
  "purchase_order",
  "shopping",
  "rfq",
  "third_party",
  "phone",
];

export function normalizeProcurementOrderMethod(
  input: string | null | undefined,
): ProcurementOrderMethod {
  if (!input) {
    throw new Error("Order method is required");
  }

  const normalized = input.trim().toLowerCase();
  const direct = ORDER_METHOD_MAP[normalized];
  if (direct) return direct;

  const compact = normalized.replace(/[\s-]+/g, "_");
  const compactMapped = ORDER_METHOD_MAP[compact] || ORDER_METHOD_MAP[compact.replace(/_/g, "")];
  if (compactMapped) return compactMapped;

  throw new Error(`Unsupported procurement order method: ${input}`);
}

export function procurementOrderMethodLabel(method: ProcurementOrderMethod): string {
  switch (method) {
    case "email":
      return "Email";
    case "online":
      return "Online";
    case "purchase_order":
      return "Purchase Order";
    case "shopping":
      return "Shopping";
    case "rfq":
      return "RFQ";
    case "third_party":
      return "3rd Party";
    case "phone":
      return "Phone";
    default:
      return method;
  }
}

export const EMAIL_BASED_METHODS: ProcurementOrderMethod[] = [
  "email",
  "purchase_order",
  "rfq",
];
