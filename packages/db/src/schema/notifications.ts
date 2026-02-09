import {
  pgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const notificationsSchema = pgSchema('notifications');

// ─── Enums ────────────────────────────────────────────────────────────
export const notificationTypeEnum = pgEnum('notification_type', [
  'card_triggered',
  'po_created',
  'po_sent',
  'po_received',
  'stockout_warning',
  'relowisa_recommendation',
  'exception_alert',
  'wo_status_change',
  'transfer_status_change',
  'system_alert',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'in_app',
  'email',
  'webhook',
]);

// ─── Notifications ───────────────────────────────────────────────────
export const notifications = notificationsSchema.table(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(), // recipient
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    actionUrl: text('action_url'), // deep link into the app
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_tenant_idx').on(table.tenantId),
    index('notifications_user_idx').on(table.userId),
    index('notifications_user_unread_idx').on(table.userId, table.isRead),
    index('notifications_time_idx').on(table.createdAt),
  ]
);

// ─── Notification Preferences ────────────────────────────────────────
export const notificationPreferences = notificationsSchema.table(
  'notification_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    notificationType: notificationTypeEnum('notification_type').notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notif_prefs_user_idx').on(table.userId),
    index('notif_prefs_tenant_idx').on(table.tenantId),
  ]
);
