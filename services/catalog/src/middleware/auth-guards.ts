import { Permission, requirePermission } from '@arda/auth-utils';

// ─── Catalog Service Authorization Guards ───────────────────────────
// Each guard maps to a specific route action and enforces the RBAC matrix.

export const guards = {
  // ─── Parts ────────────────────────────────────────────────────────
  readParts: requirePermission(Permission.CATALOG_PARTS_READ),
  createPart: requirePermission(Permission.CATALOG_PARTS_CREATE),
  updatePart: requirePermission(Permission.CATALOG_PARTS_UPDATE),
  deletePart: requirePermission(Permission.CATALOG_PARTS_DELETE),

  // ─── Suppliers ────────────────────────────────────────────────────
  readSuppliers: requirePermission(Permission.CATALOG_SUPPLIERS_READ),
  createSupplier: requirePermission(Permission.CATALOG_SUPPLIERS_CREATE),
  updateSupplier: requirePermission(Permission.CATALOG_SUPPLIERS_UPDATE),
  linkSupplierParts: requirePermission(Permission.CATALOG_SUPPLIERS_LINK_PARTS),

  // ─── Categories ───────────────────────────────────────────────────
  readCategories: requirePermission(Permission.CATALOG_CATEGORIES_READ),
  createCategory: requirePermission(Permission.CATALOG_CATEGORIES_CREATE),
  updateCategory: requirePermission(Permission.CATALOG_CATEGORIES_UPDATE),

  // ─── BOM ──────────────────────────────────────────────────────────
  readBom: requirePermission(Permission.CATALOG_BOM_READ),
  createBomItem: requirePermission(Permission.CATALOG_BOM_CREATE),
  deleteBomItem: requirePermission(Permission.CATALOG_BOM_DELETE),
} as const;
