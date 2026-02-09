/**
 * Production UI Types
 *
 * TypeScript interfaces for all production-related UI components.
 * These mirror the backend shared-types but are optimized for
 * frontend display concerns (resolved names, computed fields).
 */

// ─── Status Types ──────────────────────────────────────────────────

export type WOStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

export type WOHoldReason =
  | 'material_shortage'
  | 'equipment_failure'
  | 'quality_hold'
  | 'labor_unavailable'
  | 'other';

export type RoutingStepStatus =
  | 'pending'
  | 'in_progress'
  | 'complete'
  | 'on_hold'
  | 'skipped';

// ─── Queue Item ────────────────────────────────────────────────────

export interface ProductionQueueItem {
  id: string;
  workOrderId: string;
  woNumber: string;
  partId: string;
  partNumber: string;
  partName: string;
  facilityId: string;
  facilityName: string;
  status: WOStatus;
  priorityScore: number;
  manualPriority: number;
  isExpedited: boolean;
  isRework: boolean;
  quantityToProduce: number;
  quantityProduced: number;
  quantityScrapped: number;
  totalSteps: number;
  completedSteps: number;
  holdReason: WOHoldReason | null;
  holdNotes: string | null;
  scheduledStartDate: string | null;
  enteredQueueAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

// ─── Routing Step ──────────────────────────────────────────────────

export interface RoutingStep {
  id: string;
  workOrderId: string;
  stepNumber: number;
  operationName: string;
  workCenterCode: string;
  workCenterName: string;
  status: RoutingStepStatus;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
}

// ─── Work Order Detail ─────────────────────────────────────────────

export interface WorkOrderDetail extends ProductionQueueItem {
  cardId: string | null;
  loopId: string | null;
  parentWorkOrderId: string | null;
  routingTemplateId: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  steps: RoutingStep[];
}

// ─── Triage Action ─────────────────────────────────────────────────

export type TriageAction = 'expedite' | 'hold' | 'resume' | 'cancel' | 'schedule';

export interface TriageActionInput {
  workOrderId: string;
  action: TriageAction;
  holdReason?: WOHoldReason;
  holdNotes?: string;
  cancelReason?: string;
}

export interface TriageResult {
  workOrderId: string;
  action: TriageAction;
  success: boolean;
  error?: string;
}

// ─── Filter Options ────────────────────────────────────────────────

export interface ProductionQueueFilters {
  status?: WOStatus;
  facilityId?: string;
  search?: string;
  expeditedOnly?: boolean;
}

// ─── Action Callbacks ──────────────────────────────────────────────

export interface ProductionActions {
  onViewWorkOrder: (workOrderId: string) => void;
  onTransitionStatus: (workOrderId: string, toStatus: WOStatus, options?: {
    holdReason?: WOHoldReason;
    holdNotes?: string;
    cancelReason?: string;
  }) => Promise<void>;
  onExpedite: (workOrderId: string) => Promise<void>;
  onSplit: (workOrderId: string, splitQuantity: number) => Promise<void>;
  onTransitionStep: (workOrderId: string, stepId: string, toStatus: RoutingStepStatus, options?: {
    actualMinutes?: number;
    notes?: string;
  }) => Promise<void>;
  onRefreshScores: () => Promise<void>;
  onBatchTriage: (actions: TriageActionInput[]) => Promise<TriageResult[]>;
}
