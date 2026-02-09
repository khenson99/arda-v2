/**
 * @arda/search — Orders index mapping
 *
 * Defines the Elasticsearch mapping for the orders index.
 */

import type { IndexMapping } from '../types.js';

export const ORDERS_INDEX = 'arda-orders';

export const ordersMapping: IndexMapping = {
  dynamic: 'strict',
  settings: {
    numberOfShards: 1,
    numberOfReplicas: 1,
  },
  properties: {
    orderNumber: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword', ignore_above: 50 },
      },
    },
    status: {
      type: 'keyword',
    },
    priority: {
      type: 'keyword',
    },
    customerId: {
      type: 'keyword',
    },
    customerName: {
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
    totalAmount: {
      type: 'float',
    },
    currency: {
      type: 'keyword',
    },
    lineItems: {
      type: 'nested',
      properties: {
        partNumber: { type: 'keyword' },
        partName: { type: 'text' },
        quantity: { type: 'integer' },
        unitPrice: { type: 'float' },
        lineTotal: { type: 'float' },
      },
    },
    riskLevel: {
      type: 'keyword',
    },
    dueDate: {
      type: 'date',
    },
    shippedDate: {
      type: 'date',
    },
    notes: {
      type: 'text',
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
