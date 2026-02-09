/**
 * @arda/search — Parts index mapping
 *
 * Defines the Elasticsearch mapping for the parts/catalog index.
 */

import type { IndexMapping } from '../types.js';

export const PARTS_INDEX = 'arda-parts';

export const partsMapping: IndexMapping = {
  dynamic: 'strict',
  settings: {
    numberOfShards: 1,
    numberOfReplicas: 1,
    analysis: {
      analyzer: {
        part_number_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding'],
        },
      },
    },
  },
  properties: {
    partNumber: {
      type: 'text',
      analyzer: 'part_number_analyzer',
      fields: {
        keyword: { type: 'keyword', ignore_above: 100 },
      },
    },
    name: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
      },
    },
    description: {
      type: 'text',
    },
    category: {
      type: 'keyword',
    },
    subcategory: {
      type: 'keyword',
    },
    manufacturer: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
      },
    },
    supplierId: {
      type: 'keyword',
    },
    supplierName: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
      },
    },
    unitPrice: {
      type: 'float',
    },
    currency: {
      type: 'keyword',
    },
    leadTimeDays: {
      type: 'integer',
    },
    moq: {
      type: 'integer',
    },
    status: {
      type: 'keyword',
    },
    tags: {
      type: 'keyword',
    },
    tenantId: {
      type: 'keyword',
    },
    createdAt: {
      type: 'date',
    },
    updatedAt: {
      type: 'date',
    },
  },
};
