/**
 * Shopping List Adapter
 *
 * Wraps shopping-list additions through the normalized ActionAdapter
 * interface. Supports grouping by supplier, facility, and urgency so
 * the downstream catalog/items service can batch-process additions.
 */

import { createLogger } from '@arda/config';
import type {
  ActionAdapter,
  ActionAdapterResult,
  ShoppingListContext,
} from '../types.js';

const log = createLogger('automation:adapter:shopping-list');

// ─── Persistence Interface ──────────────────────────────────────────

export interface ShoppingListPersistence {
  /** Add an item to the shopping list (or increment quantity if exists). */
  addItem(item: ShoppingListItem): Promise<ShoppingListRecord>;
}

export interface ShoppingListItem {
  tenantId: string;
  partId: string;
  quantity: number;
  supplierId?: string;
  facilityId?: string;
  urgency: 'low' | 'normal' | 'high' | 'critical';
  sourceCardId?: string;
  sourceLoopId?: string;
  notes?: string;
}

export interface ShoppingListRecord {
  id: string;
  partId: string;
  quantity: number;
  groupKey: string;
}

/**
 * Thin abstraction over event publishing.
 */
export interface ShoppingListEventPublisher {
  publishItemAdded(event: {
    tenantId: string;
    partId: string;
    quantity: number;
    supplierId?: string;
    facilityId?: string;
    urgency: string;
    groupKey: string;
  }): Promise<void>;
}

// ─── Grouping Logic ─────────────────────────────────────────────────

/**
 * Build a grouping key from supplier + facility + urgency.
 * Items sharing a key can be consolidated into a single procurement
 * action downstream.
 */
export function buildGroupKey(
  supplierId?: string,
  facilityId?: string,
  urgency: string = 'normal',
): string {
  const parts = [
    supplierId ?? 'any-supplier',
    facilityId ?? 'any-facility',
    urgency,
  ];
  return parts.join(':');
}

// ─── Adapter Result ─────────────────────────────────────────────────

export interface ShoppingListAdapterResult {
  recordId: string;
  partId: string;
  quantity: number;
  groupKey: string;
  urgency: string;
}

// ─── Event Bus Publisher (prod) ─────────────────────────────────────

export class EventBusShoppingListPublisher implements ShoppingListEventPublisher {
  constructor(
    private publishFn: (event: Record<string, unknown>) => Promise<void>,
  ) {}

  async publishItemAdded(event: {
    tenantId: string;
    partId: string;
    quantity: number;
    supplierId?: string;
    facilityId?: string;
    urgency: string;
    groupKey: string;
  }): Promise<void> {
    await this.publishFn({
      type: 'automation.shopping_list_item_added',
      tenantId: event.tenantId,
      partId: event.partId,
      quantity: event.quantity,
      supplierId: event.supplierId,
      facilityId: event.facilityId,
      urgency: event.urgency,
      groupKey: event.groupKey,
      source: 'automation',
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── In-Memory Persistence (dev/test) ───────────────────────────────

export class InMemoryShoppingListPersistence implements ShoppingListPersistence {
  public readonly items: ShoppingListRecord[] = [];

  async addItem(item: ShoppingListItem): Promise<ShoppingListRecord> {
    const groupKey = buildGroupKey(item.supplierId, item.facilityId, item.urgency);
    const record: ShoppingListRecord = {
      id: `sl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      partId: item.partId,
      quantity: item.quantity,
      groupKey,
    };
    this.items.push(record);
    return record;
  }
}

// ─── Shopping List Adapter ──────────────────────────────────────────

export class ShoppingListAdapter
  implements ActionAdapter<ShoppingListContext, ShoppingListAdapterResult>
{
  readonly name = 'shopping_list';

  constructor(
    private persistence: ShoppingListPersistence,
    private events: ShoppingListEventPublisher,
  ) {}

  async execute(
    context: ShoppingListContext,
  ): Promise<ActionAdapterResult<ShoppingListAdapterResult>> {
    try {
      const urgency = context.urgency ?? 'normal';
      const groupKey = buildGroupKey(context.supplierId, context.facilityId, urgency);

      // ── Step 1: Persist the shopping list item ──
      const record = await this.persistence.addItem({
        tenantId: context.tenantId,
        partId: context.partId,
        quantity: context.quantity,
        supplierId: context.supplierId,
        facilityId: context.facilityId,
        urgency,
        sourceCardId: context.cardId,
        sourceLoopId: context.loopId,
        notes: context.notes,
      });

      // ── Step 2: Emit domain event ──
      await this.events.publishItemAdded({
        tenantId: context.tenantId,
        partId: context.partId,
        quantity: context.quantity,
        supplierId: context.supplierId,
        facilityId: context.facilityId,
        urgency,
        groupKey,
      });

      log.info(
        { recordId: record.id, partId: context.partId, groupKey },
        'Shopping list item added via adapter',
      );

      return {
        success: true,
        data: {
          recordId: record.id,
          partId: record.partId,
          quantity: record.quantity,
          groupKey,
          urgency,
        },
        retryable: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err, context }, 'Shopping list adapter failed');
      return {
        success: false,
        error: message,
        retryable: true,
      };
    }
  }
}
