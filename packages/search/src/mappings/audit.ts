/**
 * @arda/search — Audit log index mapping
 *
 * Defines the Elasticsearch mapping for the audit log index.
 * Audit entries are append-only and should not be updated or deleted.
 */

import type { IndexMapping } from '../types.js';

export const AUDIT_INDEX = 'arda-audit';

export const auditMapping: IndexMapping = {
  dynamic: 'strict',
  settings: {
    numberOfShards: 1,
    numberOfReplicas: 1,
  },
  properties: {
    action: {
      type: 'keyword',
    },
    entityType: {
      type: 'keyword',
    },
    entityId: {
      type: 'keyword',
    },
    actorId: {
      type: 'keyword',
    },
    actorName: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
      },
    },
    actorEmail: {
      type: 'keyword',
    },
    changes: {
      type: 'object',
      properties: {
        field: { type: 'keyword' },
        oldValue: { type: 'text' },
        newValue: { type: 'text' },
      },
    },
    metadata: {
      type: 'object',
      index: false,
    },
    ipAddress: {
      type: 'keyword',
    },
    userAgent: {
      type: 'text',
      index: false,
    },
    description: {
      type: 'text',
    },
    tenantId: {
      type: 'keyword',
    },
    timestamp: {
      type: 'date',
    },
  },
};
