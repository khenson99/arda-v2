import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '@arda/db';
import type { AuthRequest } from '@arda/auth-utils';
import { AppError } from '../middleware/error-handler.js';

export const categoriesRouter = Router();
const { partCategories } = schema;

// ─── GET /categories ─────────────────────────────────────────────────
categoriesRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const categories = await db.query.partCategories.findMany({
      where: eq(partCategories.tenantId, req.user!.tenantId),
      orderBy: partCategories.sortOrder,
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

// ─── POST /categories ────────────────────────────────────────────────
categoriesRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const input = z
      .object({
        name: z.string().min(1).max(255),
        parentCategoryId: z.string().uuid().optional(),
        description: z.string().optional(),
        sortOrder: z.number().int().default(0),
      })
      .parse(req.body);

    const [created] = await db
      .insert(partCategories)
      .values({ ...input, tenantId: req.user!.tenantId })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    next(err);
  }
});

// ─── PATCH /categories/:id ───────────────────────────────────────────
categoriesRouter.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const input = z
      .object({
        name: z.string().min(1).max(255).optional(),
        parentCategoryId: z.string().uuid().nullable().optional(),
        description: z.string().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body);

    const [updated] = await db
      .update(partCategories)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(eq(partCategories.id, req.params.id as string), eq(partCategories.tenantId, req.user!.tenantId))
      )
      .returning();

    if (!updated) throw new AppError(404, 'Category not found');
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    next(err);
  }
});
