/**
 * Procurement Components — Barrel Export
 *
 * All procurement-related UI components for queue review,
 * PO management, and supplier performance display.
 */

// Types
export type {
  CriticalityLevel,
  QueueItem,
  POStatus,
  POLine,
  PurchaseOrder,
  SupplierGrade,
  SupplierPerformanceSummary,
  ProcurementActions,
} from './types';

// Queue Components
export { QueueItemCard, type QueueItemCardProps } from './queue-item-card';
export { QueueReviewPanel, type QueueReviewPanelProps } from './queue-review-panel';

// PO Components
export { PODetailCard, type PODetailCardProps } from './po-detail-card';

// Supplier Performance Components
export {
  SupplierGradeBadge,
  SupplierPerformanceIndicator,
  type SupplierGradeBadgeProps,
  type SupplierPerformanceIndicatorProps,
} from './supplier-grade-badge';

// Vendor Automation Components
export {
  normalizeProcurementOrderMethod,
  procurementOrderMethodLabel,
  PROCUREMENT_ORDER_METHODS,
  EMAIL_BASED_METHODS,
} from './order-method';
export { buildVendorQueueGroups, type VendorQueueGroup, type VendorQueueLine } from './vendor-queue';
export { VendorOrderConfigDialog } from './vendor-order-config-dialog';
export { VendorOrderExecutionPanel, type VendorExecutionSession } from './vendor-order-execution-panel';
export { validateVendorOrderConfig, isExecutionComplete } from './vendor-order-workflow';
