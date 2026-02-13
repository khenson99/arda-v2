import { beforeAll, describe, expect, it } from 'vitest';
import type { CardTemplateDefinition } from '@arda/shared-types';

let validateTemplateDefinitionForTests: ((definition: CardTemplateDefinition) => void) | null = null;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/arda_v2_test';
  const module = await import('./card-templates.routes.js');
  validateTemplateDefinitionForTests = module._validateTemplateDefinitionForTests;
});

function requireValidator(): (definition: CardTemplateDefinition) => void {
  if (!validateTemplateDefinitionForTests) {
    throw new Error('Template validator failed to initialize');
  }
  return validateTemplateDefinitionForTests;
}

function buildValidDefinition(): CardTemplateDefinition {
  return {
    version: 1,
    canvas: { width: 288, height: 480, background: '#eeeeee' },
    grid: { enabled: true, size: 8, snapThreshold: 4 },
    safeArea: { top: 13, right: 13, bottom: 13, left: 13 },
    requiredElementKeys: [
      'title',
      'sku',
      'qr',
      'minimum',
      'location',
      'order',
      'supplier',
      'image',
      'notes',
      'top_line',
      'bottom_bar',
    ],
    elements: [
      { id: 'title', key: 'title', type: 'bound_text', token: 'title', x: 13, y: 13, w: 160, h: 60, z: 1 },
      { id: 'sku', key: 'sku', type: 'bound_text', token: 'sku', x: 13, y: 76, w: 160, h: 20, z: 2 },
      { id: 'qr', key: 'qr', type: 'qr', x: 213, y: 13, w: 62, h: 62, z: 2 },
      { id: 'minimum', key: 'minimum', type: 'field_row_group', iconName: 'minimum', label: 'Minimum', token: 'minimumText', x: 13, y: 105, w: 262, h: 34, z: 3 },
      { id: 'location', key: 'location', type: 'field_row_group', iconName: 'location', label: 'Location', token: 'locationText', x: 13, y: 140, w: 262, h: 34, z: 3 },
      { id: 'order', key: 'order', type: 'field_row_group', iconName: 'order', label: 'Order', token: 'orderText', x: 13, y: 175, w: 262, h: 34, z: 3 },
      { id: 'supplier', key: 'supplier', type: 'field_row_group', iconName: 'supplier', label: 'Supplier', token: 'supplierText', x: 13, y: 210, w: 262, h: 34, z: 3 },
      { id: 'image', key: 'image', type: 'image', token: 'imageUrl', fit: 'contain', x: 13, y: 250, w: 262, h: 130, z: 2 },
      { id: 'notes', key: 'notes', type: 'notes_box', token: 'notesText', x: 13, y: 386, w: 262, h: 28, z: 2 },
      { id: 'top_line', key: 'top_line', type: 'line', orientation: 'horizontal', x: 13, y: 98, w: 262, h: 1, z: 1 },
      { id: 'bottom_bar', key: 'bottom_bar', type: 'rect', x: 13, y: 420, w: 262, h: 17, z: 1 },
    ],
  };
}

describe('card template definition validation', () => {
  it('accepts a valid template definition', () => {
    const validate = requireValidator();
    expect(() => validate(buildValidDefinition())).not.toThrow();
  });

  it('rejects missing required key registrations', () => {
    const def = buildValidDefinition();
    def.requiredElementKeys = def.requiredElementKeys.filter((key) => key !== 'qr');
    const validate = requireValidator();
    expect(() => validate(def)).toThrow(/requiredElementKeys entry: qr/);
  });

  it('rejects out-of-bounds elements', () => {
    const def = buildValidDefinition();
    def.elements[0] = { ...def.elements[0], x: 0 } as CardTemplateDefinition['elements'][number];
    const validate = requireValidator();
    expect(() => validate(def)).toThrow(/outside safe bounds/);
  });
});
