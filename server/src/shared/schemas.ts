import { z } from 'zod';

export const RoleEnum = z.enum(['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF', 'SALES']);
export type Role = z.infer<typeof RoleEnum>;

// Permissions mapping
export const RolePermissions: Record<Role, string[]> = {
  ADMIN: [
    'users:read', 'users:write', 'audit:read',
    'products:read', 'products:write',
    'inventory:read', 'inventory:write', 'inventory:adjust', 'inventory:transfer',
    'orders:read', 'orders:write', 'orders:fulfill',
    'suppliers:read', 'suppliers:write', 'po:read', 'po:write', 'po:receive',
    'reports:read', 'reports:export',
    'integrations:manage'
  ],
  MANAGER: [
    'users:read', 'audit:read',
    'products:read', 'products:write',
    'inventory:read', 'inventory:write', 'inventory:adjust', 'inventory:transfer',
    'orders:read', 'orders:write', 'orders:fulfill',
    'suppliers:read', 'suppliers:write', 'po:read', 'po:write', 'po:receive',
    'reports:read', 'reports:export',
    'integrations:manage'
  ],
  WAREHOUSE_STAFF: [
    'products:read',
    'inventory:read', 'inventory:adjust', 'inventory:transfer',
    'orders:read', 'orders:fulfill',
    'suppliers:read', 'po:read', 'po:receive',
    'reports:read'
  ],
  SALES: [
    'products:read',
    'inventory:read',
    'orders:read', 'orders:write',
    'reports:read'
  ]
};

// Auth Schemas
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: RoleEnum.optional().default('WAREHOUSE_STAFF'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

// Product Schemas
export const ProductSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().min(1),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative(),
  reorderLevel: z.number().int().nonnegative().default(10),
  maxLevel: z.number().int().positive().default(100),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export const CategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

// Location Schema
export const LocationSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['WAREHOUSE', 'STORE']),
  address: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

// Inventory Stock Adjustment & Transfer Schemas
export const StockAdjustmentSchema = z.object({
  productId: z.string().min(1),
  locationId: z.string().min(1),
  type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
});

export const StockTransferCreateSchema = z.object({
  sourceLocationId: z.string().min(1),
  targetLocationId: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
});

export const StockCountCreateSchema = z.object({
  locationId: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    countedQuantity: z.number().int().nonnegative(),
  })).min(1),
});

// Order Schemas
export const CustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const SalesOrderCreateSchema = z.object({
  customerId: z.string().min(1),
  locationId: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
});

// Supplier & PO Schemas
export const SupplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  leadTimeDays: z.number().int().positive().default(5),
  isActive: z.boolean().optional().default(true),
});

export const PurchaseOrderCreateSchema = z.object({
  supplierId: z.string().min(1),
  destinationLocationId: z.string().min(1),
  notes: z.string().optional(),
  expectedDate: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    orderedQuantity: z.number().int().positive(),
    unitCost: z.number().nonnegative(),
  })).min(1),
});

export const PurchaseOrderReceiveSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    receivedQuantity: z.number().int().positive(),
  })).min(1),
});

// Integration Schemas
export const WebhookCreateSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().min(8),
});

export const ApiKeyCreateSchema = z.object({
  name: z.string().min(1),
  role: RoleEnum.default('MANAGER'),
});
