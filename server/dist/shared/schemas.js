"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyCreateSchema = exports.WebhookCreateSchema = exports.PurchaseOrderReceiveSchema = exports.PurchaseOrderCreateSchema = exports.SupplierSchema = exports.SalesOrderCreateSchema = exports.CustomerSchema = exports.StockCountCreateSchema = exports.StockTransferCreateSchema = exports.StockAdjustmentSchema = exports.LocationSchema = exports.CategorySchema = exports.ProductSchema = exports.PasswordResetConfirmSchema = exports.PasswordResetRequestSchema = exports.LoginSchema = exports.RegisterSchema = exports.RolePermissions = exports.RoleEnum = void 0;
const zod_1 = require("zod");
exports.RoleEnum = zod_1.z.enum(['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF', 'SALES']);
// Permissions mapping
exports.RolePermissions = {
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
exports.RegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().min(2),
    role: exports.RoleEnum.optional().default('WAREHOUSE_STAFF'),
});
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.PasswordResetRequestSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
exports.PasswordResetConfirmSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(6),
});
// Product Schemas
exports.ProductSchema = zod_1.z.object({
    sku: zod_1.z.string().min(1),
    barcode: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    categoryId: zod_1.z.string().min(1),
    price: zod_1.z.number().nonnegative(),
    cost: zod_1.z.number().nonnegative(),
    reorderLevel: zod_1.z.number().int().nonnegative().default(10),
    maxLevel: zod_1.z.number().int().positive().default(100),
    imageUrl: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().optional().default(true),
});
exports.CategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
});
// Location Schema
exports.LocationSchema = zod_1.z.object({
    code: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    type: zod_1.z.enum(['WAREHOUSE', 'STORE']),
    address: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().optional().default(true),
});
// Inventory Stock Adjustment & Transfer Schemas
exports.StockAdjustmentSchema = zod_1.z.object({
    productId: zod_1.z.string().min(1),
    locationId: zod_1.z.string().min(1),
    type: zod_1.z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
    quantity: zod_1.z.number().int().positive(),
    reason: zod_1.z.string().min(1),
});
exports.StockTransferCreateSchema = zod_1.z.object({
    sourceLocationId: zod_1.z.string().min(1),
    targetLocationId: zod_1.z.string().min(1),
    notes: zod_1.z.string().optional(),
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        quantity: zod_1.z.number().int().positive(),
    })).min(1),
});
exports.StockCountCreateSchema = zod_1.z.object({
    locationId: zod_1.z.string().min(1),
    notes: zod_1.z.string().optional(),
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        countedQuantity: zod_1.z.number().int().nonnegative(),
    })).min(1),
});
// Order Schemas
exports.CustomerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    phone: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
});
exports.SalesOrderCreateSchema = zod_1.z.object({
    customerId: zod_1.z.string().min(1),
    locationId: zod_1.z.string().min(1),
    notes: zod_1.z.string().optional(),
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        quantity: zod_1.z.number().int().positive(),
    })).min(1),
});
// Supplier & PO Schemas
exports.SupplierSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    contactName: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    leadTimeDays: zod_1.z.number().int().positive().default(5),
    isActive: zod_1.z.boolean().optional().default(true),
});
exports.PurchaseOrderCreateSchema = zod_1.z.object({
    supplierId: zod_1.z.string().min(1),
    destinationLocationId: zod_1.z.string().min(1),
    notes: zod_1.z.string().optional(),
    expectedDate: zod_1.z.string().optional(),
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        orderedQuantity: zod_1.z.number().int().positive(),
        unitCost: zod_1.z.number().nonnegative(),
    })).min(1),
});
exports.PurchaseOrderReceiveSchema = zod_1.z.object({
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        receivedQuantity: zod_1.z.number().int().positive(),
    })).min(1),
});
// Integration Schemas
exports.WebhookCreateSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    events: zod_1.z.array(zod_1.z.string()).min(1),
    secret: zod_1.z.string().min(8),
});
exports.ApiKeyCreateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    role: exports.RoleEnum.default('MANAGER'),
});
