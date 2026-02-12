/**
 * Action Adapters — Barrel Export
 *
 * All normalized adapters that implement ActionAdapter<TContext, TResult>.
 */

// ─── Email ──────────────────────────────────────────────────────────
export {
  EmailActionAdapter,
  ConsoleEmailBackend,
  EventBusEmailBackend,
  renderTemplate,
  type EmailDeliveryBackend,
  type EmailDeliveryResult,
  type EmailTemplate,
  type EmailAdapterResult,
} from './email.adapter.js';

// ─── URL Handoff ────────────────────────────────────────────────────
export {
  URLHandoffAdapter,
  buildSignedUrl,
  verifySignedUrl,
  type URLSignerOptions,
} from './url-handoff.adapter.js';

// ─── PO Creation ────────────────────────────────────────────────────
export {
  POCreationAdapter,
  type POPersistence,
  type POCreationRecord,
  type POGuardrailChecker,
  type POEventPublisher,
  type POCreationAdapterResult,
} from './po-creation.adapter.js';

// ─── Shopping List ──────────────────────────────────────────────────
export {
  ShoppingListAdapter,
  EventBusShoppingListPublisher,
  InMemoryShoppingListPersistence,
  buildGroupKey,
  type ShoppingListPersistence,
  type ShoppingListItem,
  type ShoppingListRecord,
  type ShoppingListEventPublisher,
  type ShoppingListAdapterResult,
} from './shopping-list.adapter.js';
