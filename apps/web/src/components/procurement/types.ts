/**
 * Procurement UI Types
 *
 * TypeScript interfaces for all procurement-related UI components.
 * These mirror the backend service types but are optimized for
 * frontend display concerns.
 */

// ─── Queue Types ─────────────────────────────────────────────────────

export type CriticalityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface QueueItem {
  cardId: string;
  loopId: string;
  partId: string;
  partNumber: string;
  partName: string;
  facilityId: string;
  facilityName: string;
  supplierId: string | null;
  supplierName: string | null;
  orderQuantity: number;
  unitCost: number;
  criticality: CriticalityLevel;
  priorityScore: number;
  ageHours: number;
  estimatedLineValue: number;
  daysOfSupply: number | null;
  safetyStockDays: number;
  statedLeadTimeDays: number | null;
  triggeredAt: string;
}

// ─── Purchase Order Types ────────────────────────────────────────────

export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'acknowledged'
  | 'partially_received'
  | 'received'
  | 'closed'
  | 'cancelled';

export interface POLine {
  id: string;
  lineNumber: number;
  partId: string;
  partNumber: string;
  partName: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  lineTotal: number;
  kanbanCardId: string | null;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  facilityId: string;
  facilityName: string;
  status: POStatus;
  orderDate: string;
  expectedDeliveryDate: string;
  actualDeliveryDate: string | null;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  currency: string;
  notes: string | null;
  internalNotes: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  lines: POLine[];
}

// ─── Supplier Performance Types ──────────────────────────────────────

export type SupplierGrade = 'A' | 'B' | 'C' | 'D' | 'N/A';

export interface SupplierPerformanceSummary {
  supplierId: string;
  supplierName: string;
  grade: SupplierGrade;
  completedPOs: number;
  activePOs: number;
  onTimeDeliveryRate: number | null;
  avgLeadTimeDays: number | null;
  avgLeadTimeVarianceDays: number | null;
  qualityRate: number | null;
  partCount: number;
  statedLeadTimeDays: number | null;
}

// ─── Action Callbacks ────────────────────────────────────────────────

export interface ProcurementActions {
  onGeneratePO: (cardIds: string[]) => void;
  onViewPO: (poId: string) => void;
  onApprovePO: (poId: string) => void;
  onSendPO: (poId: string) => void;
  onCancelPO: (poId: string, reason: string) => void;
  onViewSupplier: (supplierId: string) => void;
  onViewPart: (partId: string) => void;
}
