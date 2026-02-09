/**
 * Production Fixtures — Seed data for work centers, routing templates, and template steps.
 *
 * These fixtures are used for local development and integration testing.
 * They represent a realistic small-scale manufacturing setup with 8 work centers
 * and 4 routing templates that cover common production scenarios.
 */

// ─── Work Center Fixtures ───────────────────────────────────────────

export interface WorkCenterFixture {
  code: string;
  name: string;
  description: string;
  capacityPerHour: string;
  costPerHour: string;
}

export const WORK_CENTER_FIXTURES: WorkCenterFixture[] = [
  {
    code: 'CUT',
    name: 'Cutting Station',
    description: 'Raw material cutting — saws, shears, laser cutters',
    capacityPerHour: '12.00',
    costPerHour: '45.00',
  },
  {
    code: 'MILL',
    name: 'Milling Center',
    description: 'CNC and manual milling operations',
    capacityPerHour: '6.00',
    costPerHour: '85.00',
  },
  {
    code: 'LATHE',
    name: 'Lathe Bay',
    description: 'Turning and boring operations',
    capacityPerHour: '8.00',
    costPerHour: '75.00',
  },
  {
    code: 'WELD',
    name: 'Welding Bay',
    description: 'MIG, TIG, and spot welding stations',
    capacityPerHour: '4.00',
    costPerHour: '65.00',
  },
  {
    code: 'PAINT',
    name: 'Paint Booth',
    description: 'Priming, painting, and powder coating',
    capacityPerHour: '10.00',
    costPerHour: '40.00',
  },
  {
    code: 'ASSY',
    name: 'Assembly Line',
    description: 'Manual and semi-automated assembly',
    capacityPerHour: '15.00',
    costPerHour: '35.00',
  },
  {
    code: 'QC',
    name: 'Quality Control',
    description: 'Inspection, measurement, and testing',
    capacityPerHour: '20.00',
    costPerHour: '55.00',
  },
  {
    code: 'PACK',
    name: 'Packaging Station',
    description: 'Final packaging and labeling',
    capacityPerHour: '25.00',
    costPerHour: '25.00',
  },
];

// ─── Routing Template Fixtures ──────────────────────────────────────

export interface RoutingTemplateStepFixture {
  stepNumber: number;
  operationName: string;
  workCenterCode: string; // resolved to UUID at insert time
  estimatedMinutes: number;
  instructions?: string;
}

export interface RoutingTemplateFixture {
  name: string;
  description: string;
  steps: RoutingTemplateStepFixture[];
}

export const ROUTING_TEMPLATE_FIXTURES: RoutingTemplateFixture[] = [
  {
    name: 'Standard Machining',
    description: 'Cut → Mill → QC → Pack flow for machined parts',
    steps: [
      { stepNumber: 1, operationName: 'Cut Raw Material', workCenterCode: 'CUT', estimatedMinutes: 15 },
      { stepNumber: 2, operationName: 'CNC Milling', workCenterCode: 'MILL', estimatedMinutes: 45 },
      { stepNumber: 3, operationName: 'Deburr & Clean', workCenterCode: 'MILL', estimatedMinutes: 10 },
      { stepNumber: 4, operationName: 'Quality Inspection', workCenterCode: 'QC', estimatedMinutes: 10 },
      { stepNumber: 5, operationName: 'Package', workCenterCode: 'PACK', estimatedMinutes: 5 },
    ],
  },
  {
    name: 'Fabricated Assembly',
    description: 'Cut → Weld → Paint → Assemble → QC → Pack for fabricated assemblies',
    steps: [
      { stepNumber: 1, operationName: 'Cut Components', workCenterCode: 'CUT', estimatedMinutes: 20 },
      { stepNumber: 2, operationName: 'Weld Frame', workCenterCode: 'WELD', estimatedMinutes: 60 },
      { stepNumber: 3, operationName: 'Grind & Prep Surface', workCenterCode: 'WELD', estimatedMinutes: 15 },
      { stepNumber: 4, operationName: 'Primer & Paint', workCenterCode: 'PAINT', estimatedMinutes: 30 },
      { stepNumber: 5, operationName: 'Final Assembly', workCenterCode: 'ASSY', estimatedMinutes: 45 },
      { stepNumber: 6, operationName: 'Quality Inspection', workCenterCode: 'QC', estimatedMinutes: 15 },
      { stepNumber: 7, operationName: 'Package & Label', workCenterCode: 'PACK', estimatedMinutes: 10 },
    ],
  },
  {
    name: 'Turned Parts',
    description: 'Lathe → Mill → QC → Pack for turned components',
    steps: [
      { stepNumber: 1, operationName: 'Rough Turn', workCenterCode: 'LATHE', estimatedMinutes: 20 },
      { stepNumber: 2, operationName: 'Finish Turn', workCenterCode: 'LATHE', estimatedMinutes: 25 },
      { stepNumber: 3, operationName: 'Secondary Milling', workCenterCode: 'MILL', estimatedMinutes: 15 },
      { stepNumber: 4, operationName: 'Dimensional Inspection', workCenterCode: 'QC', estimatedMinutes: 10 },
      { stepNumber: 5, operationName: 'Package', workCenterCode: 'PACK', estimatedMinutes: 5 },
    ],
  },
  {
    name: 'Quick Assembly',
    description: 'Simple assemble → QC → Pack flow for kit assembly',
    steps: [
      { stepNumber: 1, operationName: 'Kit Assembly', workCenterCode: 'ASSY', estimatedMinutes: 20 },
      { stepNumber: 2, operationName: 'Function Test', workCenterCode: 'QC', estimatedMinutes: 10 },
      { stepNumber: 3, operationName: 'Package & Label', workCenterCode: 'PACK', estimatedMinutes: 5 },
    ],
  },
];
