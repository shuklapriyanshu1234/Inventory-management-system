"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrationFromLegacyJson = runMigrationFromLegacyJson;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = __importDefault(require("../../db"));
const auth_1 = require("../../middlewares/auth");
const audit_1 = require("../../middlewares/audit");
const router = (0, express_1.Router)();
async function runMigrationFromLegacyJson(filePath, userId) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error(`Legacy JSON file not found at path: ${filePath}`);
    }
    const raw = fs_1.default.readFileSync(filePath, 'utf8');
    const items = JSON.parse(raw);
    // 1. Ensure a default Category and Location exist
    let category = await db_1.default.category.findFirst({ where: { name: 'General Merchandise' } });
    if (!category) {
        category = await db_1.default.category.create({
            data: { name: 'General Merchandise', description: 'Migrated from legacy store catalog' }
        });
    }
    let location = await db_1.default.location.findFirst({ where: { code: 'WH-MAIN' } });
    if (!location) {
        location = await db_1.default.location.create({
            data: {
                code: 'WH-MAIN',
                name: 'Main Central Warehouse',
                type: 'WAREHOUSE',
                address: '100 Logistics Blvd, Suite A'
            }
        });
    }
    let importedCount = 0;
    let updatedCount = 0;
    for (const item of items) {
        const sku = `SKU-LEGACY-${item.id.slice(-6)}`;
        const barcode = item.id;
        const price = Number(item.price) || 0;
        const cost = Math.round(price * 0.6 * 100) / 100; // 40% margin assumption
        const quantity = parseInt(String(item.quantity), 10) || 0;
        // Create or update Product
        const existing = await db_1.default.product.findFirst({
            where: { OR: [{ barcode }, { sku }] }
        });
        let productId;
        if (existing) {
            const updated = await db_1.default.product.update({
                where: { id: existing.id },
                data: {
                    name: item.name,
                    price,
                    cost,
                    categoryId: category.id
                }
            });
            productId = updated.id;
            updatedCount++;
        }
        else {
            const created = await db_1.default.product.create({
                data: {
                    sku,
                    barcode,
                    name: item.name,
                    description: `Migrated from prototype item ${item.name}`,
                    categoryId: category.id,
                    price,
                    cost,
                    reorderLevel: 5,
                    maxLevel: 100,
                    isActive: true
                }
            });
            productId = created.id;
            importedCount++;
        }
        // Set stock record
        const existingStock = await db_1.default.stock.findUnique({
            where: { productId_locationId: { productId, locationId: location.id } }
        });
        if (existingStock) {
            const diff = quantity - existingStock.quantityOnHand;
            if (diff !== 0) {
                await db_1.default.stock.update({
                    where: { id: existingStock.id },
                    data: {
                        quantityOnHand: quantity,
                        version: { increment: 1 }
                    }
                });
                await db_1.default.stockMovement.create({
                    data: {
                        productId,
                        locationId: location.id,
                        type: diff > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
                        changeQuantity: diff,
                        beforeQuantity: existingStock.quantityOnHand,
                        afterQuantity: quantity,
                        referenceType: 'MIGRATION',
                        referenceId: item.id,
                        reason: 'Prototype data migration stock synchronization',
                        userId: userId || null
                    }
                });
            }
        }
        else {
            await db_1.default.stock.create({
                data: {
                    productId,
                    locationId: location.id,
                    quantityOnHand: quantity,
                    quantityReserved: 0
                }
            });
            await db_1.default.stockMovement.create({
                data: {
                    productId,
                    locationId: location.id,
                    type: 'RECEIPT',
                    changeQuantity: quantity,
                    beforeQuantity: 0,
                    afterQuantity: quantity,
                    referenceType: 'MIGRATION',
                    referenceId: item.id,
                    reason: 'Initial prototype migration load',
                    userId: userId || null
                }
            });
        }
    }
    return { total: items.length, importedCount, updatedCount };
}
// POST endpoint to trigger migration from server
router.post('/import-prototype', auth_1.authenticate, (0, auth_1.requireRole)('ADMIN'), async (req, res, next) => {
    try {
        const legacyPath = path_1.default.resolve(process.cwd(), '../legacy_inventory.json');
        const result = await runMigrationFromLegacyJson(legacyPath, req.user?.id);
        await (0, audit_1.logAudit)(req, 'MIGRATE_PROTOTYPE_DATA', 'Product', null, result);
        res.json({
            message: 'Legacy prototype data successfully migrated to database',
            ...result
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
