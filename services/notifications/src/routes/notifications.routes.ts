import { Router } from 'express';
import { z } from 'zod';
import { db, schema } from '@arda/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { AppError } from '../middleware/error-handler.js';

export const notificationsRouter = Router();

// Query validation schemas
const listQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  type: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const markReadBodySchema = z.object({});

// GET / — List notifications for current user
notificationsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const tenantId = req.user!.tenantId;

    const queryParams = listQuerySchema.parse(req.query);

    // Build conditions array — Drizzle v0.39 doesn't support chaining multiple .where()
    const conditions = [
      eq(schema.notifications.tenantId, tenantId),
      eq(schema.notifications.userId, userId),
    ];

    if (queryParams.unreadOnly) {
      conditions.push(eq(schema.notifications.isRead, false));
    }

    if (queryParams.type) {
      conditions.push(eq(schema.notifications.type, queryParams.type as any));
    }

    const notifications = await db
      .select()
      .from(schema.notifications)
      .where(and(...conditions))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(queryParams.limit as number)
      .offset(queryParams.offset as number);

    res.json({ data: notifications, count: notifications.length });
  } catch (err) {
    next(err);
  }
});

// GET /unread-count — Get unread count for current user
notificationsRouter.get('/unread-count', async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const tenantId = req.user!.tenantId;

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.tenantId, tenantId),
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.isRead, false)
        )
      );

    const count = result[0]?.count || 0;
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// PATCH /:id/read — Mark single notification as read
notificationsRouter.patch('/:id/read', async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.sub;
    const tenantId = req.user!.tenantId;

    // Verify ownership before updating
    const notification = await db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.tenantId, tenantId),
          eq(schema.notifications.userId, userId)
        )
      );

    if (!notification.length) {
      throw new AppError(404, 'Notification not found', 'NOT_FOUND');
    }

    const updated = await db
      .update(schema.notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.tenantId, tenantId),
          eq(schema.notifications.userId, userId)
        )
      )
      .returning();

    res.json({ data: updated[0] });
  } catch (err) {
    next(err);
  }
});

// POST /mark-all-read — Mark all unread notifications as read
notificationsRouter.post('/mark-all-read', async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const tenantId = req.user!.tenantId;

    await db
      .update(schema.notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.tenantId, tenantId),
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.isRead, false)
        )
      );

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

// DELETE /:id — Soft delete a notification
notificationsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.sub;
    const tenantId = req.user!.tenantId;

    // Verify ownership before deleting
    const notification = await db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.tenantId, tenantId),
          eq(schema.notifications.userId, userId)
        )
      );

    if (!notification.length) {
      throw new AppError(404, 'Notification not found', 'NOT_FOUND');
    }

    await db
      .delete(schema.notifications)
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.tenantId, tenantId),
          eq(schema.notifications.userId, userId)
        )
      );

    res.json({ message: 'Notification deleted' });
  } catch (err) {
    next(err);
  }
});
