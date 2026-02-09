import { Permission, requirePermission } from '@arda/auth-utils';

// ─── Orders Service Authorization Guards ────────────────────────────
// Each guard maps to a specific route action and enforces the RBAC matrix.

export const guards = {
  // ─── Purchase Orders ────────────────────────────────────────────────
  readPurchaseOrders: requirePermission(Permission.ORDERS_PURCHASE_ORDERS_READ),
  createPurchaseOrder: requirePermission(Permission.ORDERS_PURCHASE_ORDERS_CREATE),
  updatePurchaseOrderStatus: requirePermission(Permission.ORDERS_PURCHASE_ORDERS_UPDATE_STATUS),
  addPurchaseOrderLines: requirePermission(Permission.ORDERS_PURCHASE_ORDERS_ADD_LINES),
  receivePurchaseOrder: requirePermission(Permission.ORDERS_PURCHASE_ORDERS_RECEIVE),

  // ─── Work Orders ───────────────────────────────────────────────────
  readWorkOrders: requirePermission(Permission.ORDERS_WORK_ORDERS_READ),
  createWorkOrder: requirePermission(Permission.ORDERS_WORK_ORDERS_CREATE),
  updateWorkOrderStatus: requirePermission(Permission.ORDERS_WORK_ORDERS_UPDATE_STATUS),
  updateWorkOrderRouting: requirePermission(Permission.ORDERS_WORK_ORDERS_UPDATE_ROUTING),
  updateWorkOrderProduction: requirePermission(Permission.ORDERS_WORK_ORDERS_UPDATE_PRODUCTION),

  // ─── Transfer Orders ──────────────────────────────────────────────
  readTransferOrders: requirePermission(Permission.ORDERS_TRANSFER_ORDERS_READ),
  createTransferOrder: requirePermission(Permission.ORDERS_TRANSFER_ORDERS_CREATE),
  updateTransferOrderStatus: requirePermission(Permission.ORDERS_TRANSFER_ORDERS_UPDATE_STATUS),
  shipTransferOrder: requirePermission(Permission.ORDERS_TRANSFER_ORDERS_SHIP),
  receiveTransferOrder: requirePermission(Permission.ORDERS_TRANSFER_ORDERS_RECEIVE),

  // ─── Order Queue ──────────────────────────────────────────────────
  readOrderQueue: requirePermission(Permission.ORDERS_ORDER_QUEUE_READ),
  createPOFromQueue: requirePermission(Permission.ORDERS_ORDER_QUEUE_CREATE_PO),
  createWOFromQueue: requirePermission(Permission.ORDERS_ORDER_QUEUE_CREATE_WO),
  createTOFromQueue: requirePermission(Permission.ORDERS_ORDER_QUEUE_CREATE_TO),
  riskScan: requirePermission(Permission.ORDERS_ORDER_QUEUE_RISK_SCAN),

  // ─── Work Centers ─────────────────────────────────────────────────
  readWorkCenters: requirePermission(Permission.ORDERS_WORK_CENTERS_READ),
  createWorkCenter: requirePermission(Permission.ORDERS_WORK_CENTERS_CREATE),
  updateWorkCenter: requirePermission(Permission.ORDERS_WORK_CENTERS_UPDATE),
  deleteWorkCenter: requirePermission(Permission.ORDERS_WORK_CENTERS_DELETE),

  // ─── Audit ────────────────────────────────────────────────────────
  readAudit: requirePermission(Permission.ORDERS_AUDIT_READ),
} as const;
