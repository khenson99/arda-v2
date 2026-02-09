/**
 * @arda/search — Suppliers index mapping
 *
 * Defines the Elasticsearch mapping for the suppliers index.
 */

import type { IndexMapping } from '../types.js';

export const SUPPLIERS_INDEX = 'arda-suppliers';

export const suppliersMapping: IndexMapping = {
  dynamic: 'strict',
  settings: {
    numberOfShards: 1,
    numberOfReplicas: 1,
  },
  properties: {
    name: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
      },
    },
    contactName: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
      },
    },
    contactEmail: {
      type: 'keyword',
    },
    phone: {
      type: 'keyword',
    },
    website: {
      type: 'keyword',
    },
    address: {
      type: 'object',
      properties: {
        street: { type: 'text' },
        city: { type: 'keyword' },
        state: { type: 'keyword' },
        postalCode: { type: 'keyword' },
        country: { type: 'keyword' },
      },
    },
    categories: {
      type: 'keyword',
    },
    rating: {
      type: 'float',
    },
    status: {
      type: 'keyword',
    },
    notes: {
      type: 'text',
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
