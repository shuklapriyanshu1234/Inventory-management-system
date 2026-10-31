"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const db_1 = __importDefault(require("../../db"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const audit_1 = require("../../middlewares/audit");
const schemas_1 = require("../../shared/schemas");
const router = (0, express_1.Router)();
// ========================
// API KEYS MANAGEMENT
// ========================
router.get('/keys', auth_1.authenticate, (0, auth_1.authorize)('integrations:manage'), async (req, res, next) => {
    try {
        const keys = await db_1.default.apiKey.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(keys);
    }
    catch (err) {
        next(err);
    }
});
router.post('/keys', auth_1.authenticate, (0, auth_1.authorize)('integrations:manage'), (0, validate_1.validate)(schemas_1.ApiKeyCreateSchema), async (req, res, next) => {
    try {
        const { name, role } = req.body;
        const generatedKey = `xyz_${crypto_1.default.randomBytes(24).toString('hex')}`;
        const apiKey = await db_1.default.apiKey.create({
            data: {
                key: generatedKey,
                name,
                role: role || 'MANAGER'
            }
        });
        await (0, audit_1.logAudit)(req, 'CREATE_API_KEY', 'ApiKey', apiKey.id, { name, role });
        res.status(201).json(apiKey);
    }
    catch (err) {
        next(err);
    }
});
router.delete('/keys/:id', auth_1.authenticate, (0, auth_1.authorize)('integrations:manage'), async (req, res, next) => {
    try {
        const { id } = req.params;
        await db_1.default.apiKey.delete({ where: { id } });
        await (0, audit_1.logAudit)(req, 'DELETE_API_KEY', 'ApiKey', id);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// ========================
// WEBHOOKS MANAGEMENT
// ========================
router.get('/webhooks', auth_1.authenticate, (0, auth_1.authorize)('integrations:manage'), async (req, res, next) => {
    try {
        const webhooks = await db_1.default.webhook.findMany({
            include: {
                deliveries: {
                    take: 10,
                    orderBy: { createdAt: 'desc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(webhooks);
    }
    catch (err) {
        next(err);
    }
});
router.post('/webhooks', auth_1.authenticate, (0, auth_1.authorize)('integrations:manage'), (0, validate_1.validate)(schemas_1.WebhookCreateSchema), async (req, res, next) => {
    try {
        const { url, events, secret } = req.body;
        const webhook = await db_1.default.webhook.create({
            data: {
                url,
                events: Array.isArray(events) ? events.join(',') : events,
                secret
            }
        });
        await (0, audit_1.logAudit)(req, 'CREATE_WEBHOOK', 'Webhook', webhook.id, { url });
        res.status(201).json(webhook);
    }
    catch (err) {
        next(err);
    }
});
router.delete('/webhooks/:id', auth_1.authenticate, (0, auth_1.authorize)('integrations:manage'), async (req, res, next) => {
    try {
        const { id } = req.params;
        await db_1.default.webhook.delete({ where: { id } });
        await (0, audit_1.logAudit)(req, 'DELETE_WEBHOOK', 'Webhook', id);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// ========================
// ERP & ACCOUNTING SYSTEM ADAPTERS
// ========================
// Adapter interface implementations:
// 1. ERP Inventory Sync Adapter (SAP / Oracle NetSuite format)
// 2. Accounting General Ledger Journal Entries Export (QuickBooks / Xero format)
router.get('/adapters/erp/inventory-sync', auth_1.authenticate, (0, auth_1.authorize)('integrations:manage'), async (req, res, next) => {
    try {
        const stocks = await db_1.default.stock.findMany({
            include: { product: true, location: true }
        });
        const erpPayload = {
            sourceSystem: 'XYZ_INVENTORY_SYSTEM',
            exportTimestamp: new Date().toISOString(),
            recordCount: stocks.length,
            items: stocks.map(s => ({
                materialNumber: s.product.sku,
                plant: s.location.code,
                storageLocation: 'PRIMARY',
                unrestrictedStock: s.quantityOnHand - s.quantityReserved,
                reservedStock: s.quantityReserved,
                unitOfMeasure: 'EA',
                valuationClass: '3000',
                standardCost: s.product.cost
            }))
        };
        res.json(erpPayload);
    }
    catch (err) {
        next(err);
    }
});
router.get('/adapters/accounting/journal-entries', auth_1.authenticate, (0, auth_1.authorize)('integrations:manage'), async (req, res, next) => {
    try {
        const movements = await db_1.default.stockMovement.findMany({
            take: 100,
            orderBy: { createdAt: 'desc' },
            include: { product: true, location: true }
        });
        const journalEntries = movements.map((m, index) => {
            const totalMovementCost = Math.abs(m.changeQuantity) * m.product.cost;
            const isAddition = m.changeQuantity > 0;
            return {
                entryNumber: `JE-${m.createdAt.getFullYear()}-${String(index + 1).padStart(5, '0')}`,
                date: m.createdAt.toISOString().slice(0, 10),
                reference: `${m.type} - ${m.referenceType || 'STOCK'}:${m.referenceId || m.id}`,
                memo: m.reason || `Stock ${m.type} for ${m.product.sku}`,
                lines: [
                    {
                        accountNumber: '1200',
                        accountName: 'Merchandise Inventory Asset',
                        debit: isAddition ? totalMovementCost : 0,
                        credit: isAddition ? 0 : totalMovementCost
                    },
                    {
                        accountNumber: isAddition ? '2000' : '5000',
                        accountName: isAddition ? 'Accounts Payable / Inventory Offset' : 'Cost of Goods Sold',
                        debit: isAddition ? 0 : totalMovementCost,
                        credit: isAddition ? totalMovementCost : 0
                    }
                ]
            };
        });
        res.json({
            targetSystem: 'QUICKBOOKS_XERO_UNIVERSAL_LEDGER',
            currency: 'USD',
            entries: journalEntries
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
