// ─── Printing Module Barrel Export ───────────────────────────────────

// Templates
export { KanbanCardTemplate } from './kanban-card-template';
export { KanbanLabelTemplate } from './kanban-label-template';
export { KanbanPrintRenderer, isCardFormat, isLabelFormat } from './kanban-print-renderer';

// Sub-components
export { LoopTypeBand } from './loop-type-band';
export { StageBadgePrint } from './stage-badge-print';
export { TenantLogo } from './tenant-logo';

// Pipeline
export {
  PrintPipeline,
  PrintPreview,
  PrintControls,
  getDefaultSettings,
  calculateCardsPerPage,
  buildPrintStylesheet,
  dispatchPrint,
  printCards,
} from './print-pipeline';
export type { PrintSettings, PrintMargins, PrinterClass, ColorMode, Orientation } from './print-pipeline';

// Batch Print
export { BatchPrintSelector } from './batch-print-selector';

// Validation
export { validatePrintData } from './validation';

// Types & Config
export type { KanbanPrintData, PrintTemplateProps, FormatConfig, ValidationResult } from './types';
export { FORMAT_CONFIGS, STAGE_LABELS, LOOP_TYPE_LABELS } from './types';
