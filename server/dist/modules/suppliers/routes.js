"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../../db"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const audit_1 = require("../../middlewares/audit");
const sse_1 = require("../inventory/sse");
const webhookDispatcher_1 = require("../integrations/webhookDispatcher");
const schemas_1 = require("../../shared/schemas");
const router = (0, express_1.Router)();
// ========================
// SUPPLIERS CRUD
// ========================
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('suppliers:read'), async (req, res, next) => {
    try {
        const suppliers = await db_1.default.supplier.findMany({
            include: {
                _count: { select: { purchaseOrders: true } }
            },
            orderBy: { name: 'asc' }
        });
        res.json(suppliers);
    }
    catch (err) {
        next(err);
    }
});
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('suppliers:write'), (0, validate_1.validate)(schemas_1.SupplierSchema), async (req, res, next) => {
    try {
        const { name, contactName, email, phone, address, leadTimeDays, isActive } = req.body;
        const existing = await db_1.default.supplier.findUnique({ where: { name } });
        if (existing) {
            res.status(400).json({ error: 'Supplier name already exists' });
            return;
        }
        const supplier = await db_1.default.supplier.create({
            data: { name, contactName, email, phone, address, leadTimeDays, isActive: isActive !== undefined ? isActive : true }
        });
        await (0, audit_1.logAudit)(req, 'CREATE_SUPPLIER', 'Supplier', supplier.id, { name });
        res.status(201).json(supplier);
    }
    catch (err) {
        next(err);
    }
});
router.patch('/:id', auth_1.authenticate, (0, auth_1.authorize)('suppliers:write'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, contactName, email, phone, address, leadTimeDays, isActive } = req.body;
        const supplier = await db_1.default.supplier.update({
            where: { id },
            data: { name, contactName, email, phone, address, leadTimeDays, isActive }
        });
        await (0, audit_1.logAudit)(req, 'UPDATE_SUPPLIER', 'Supplier', id, { name, isActive });
        res.json(supplier);
    }
    catch (err) {
        next(err);
    }
});
// ========================
// SUPPLIER PERFORMANCE METRICS
// ========================
router.get('/metrics/performance', auth_1.authenticate, (0, auth_1.authorize)('reports:read'), async (req, res, next) => {
    try {
        const suppliers = await db_1.default.supplier.findMany({
            include: {
                purchaseOrders: {
                    include: { items: true }
                }
            }
        });
        const metrics = suppliers.map(sup => {
            const pos = sup.purchaseOrders;
            const completedPos = pos.filter(p => p.status === 'RECEIVED');
            let onTimeCount = 0;
            let totalOrderedQty = 0;
            let totalReceivedQty = 0;
            let leadTimesDaysSum = 0;
            for (const po of completedPos) {
                if (po.expectedDate && po.receivedDate) {
                    if (new Date(po.receivedDate) <= new Date(po.expectedDate)) {
                        onTimeCount++;
                    }
                    const leadTime = (new Date(po.receivedDate).getTime() - new Date(po.createdAt).getTime()) / (1000 * 3600 * 24);
                    leadTimesDaysSum += Math.max(0, leadTime);
                }
                for (const item of po.items) {
                    totalOrderedQty += item.orderedQuantity;
                    totalReceivedQty += item.receivedQuantity;
                }
            }
            const onTimeDeliveryRate = completedPos.length > 0 ? (onTimeCount / completedPos.length) * 100 : 100;
            const fillRate = totalOrderedQty > 0 ? (totalReceivedQty / totalOrderedQty) * 100 : 100;
            const avgLeadTimeDays = completedPos.length > 0 ? Math.round((leadTimesDaysSum / completedPos.length) * 10) / 10 : sup.leadTimeDays;
            return {
                supplierId: sup.id,
                supplierName: sup.name,
                contactName: sup.contactName,
                totalOrders: pos.length,
                completedOrders: completedPos.length,
                onTimeDeliveryRate: Math.round(onTimeDeliveryRate * 10) / 10,
                fillRate: Math.round(fillRate * 10) / 10,
                avgLeadTimeDays
            };
        });
        res.json(metrics);
    }
    catch (err) {
        next(err);
    }
});
// ========================
// REORDER SUGGESTIONS & AUTO-DRAFT PO
// ========================
router.get('/reorder-suggestions', auth_1.authenticate, (0, auth_1.authorize)('po:read'), async (req, res, next) => {
    try {
        // Find all products where total stock on hand <= reorderLevel
        const products = await db_1.default.product.findMany({
            where: { isActive: true },
            include: {
                stocks: { include: { location: true } }
            }
        });
        const suggestions = [];
        for (const p of products) {
            const totalOnHand = p.stocks.reduce((acc, s) => acc + s.quantityOnHand, 0);
            if (totalOnHand <= p.reorderLevel) {
                const suggestedQuantity = p.maxLevel - totalOnHand;
                suggestions.push({
                    productId: p.id,
                    sku: p.sku,
                    barcode: p.barcode,
                    name: p.name,
                    currentStock: totalOnHand,
                    reorderLevel: p.reorderLevel,
                    maxLevel: p.maxLevel,
                    unitCost: p.cost,
                    suggestedQuantity: Math.max(suggestedQuantity, 10),
                    estimatedCost: Math.max(suggestedQuantity, 10) * p.cost
                });
            }
        }
        res.json(suggestions);
    }
    catch (err) {
        next(err);
    }
});
// Auto-Draft Purchase Order from Low-Stock Suggestions
router.post('/auto-draft-po', auth_1.authenticate, (0, auth_1.authorize)('po:write'), async (req, res, next) => {
    try {
        const { supplierId, destinationLocationId } = req.body;
        const userId = req.user?.id;
        if (!supplierId || !destinationLocationId) {
            res.status(400).json({ error: 'supplierId and destinationLocationId are required' });
            return;
        }
        const supplier = await db_1.default.supplier.findUniqueOrThrow({ where: { id: supplierId } });
        const products = await db_1.default.product.findMany({
            where: { isActive: true },
            include: { stocks: true }
        });
        const lowStockItems = [];
        let totalAmount = 0;
        for (const p of products) {
            const totalOnHand = p.stocks.reduce((acc, s) => acc + s.quantityOnHand, 0);
            if (totalOnHand <= p.reorderLevel) {
                const qty = Math.max(p.maxLevel - totalOnHand, 10);
                totalAmount += qty * p.cost;
                lowStockItems.push({
                    productId: p.id,
                    orderedQuantity: qty,
                    receivedQuantity: 0,
                    unitCost: p.cost
                });
            }
        }
        if (lowStockItems.length === 0) {
            res.status(400).json({ error: 'No low-stock items found to reorder' });
            return;
        }
        const poNumber = `PO-AUTO-${Date.now().toString().slice(-6)}`;
        const expectedDate = new Date(Date.now() + supplier.leadTimeDays * 86400000);
        const po = await db_1.default.purchaseOrder.create({
            data: {
                poNumber,
                supplierId,
                destinationLocationId,
                status: 'DRAFT',
                totalAmount,
                expectedDate,
                notes: `Automated reorder draft based on low-stock thresholds`,
                createdById: userId || null,
                items: {
                    create: lowStockItems
                }
            },
            include: {
                supplier: true,
                destinationLocation: true,
                items: { include: { product: true } }
            }
        });
        await (0, audit_1.logAudit)(req, 'AUTO_DRAFT_PO', 'PurchaseOrder', po.id, { poNumber, itemCount: lowStockItems.length });
        res.status(201).json(po);
    }
    catch (err) {
        next(err);
    }
});
// ========================
// PURCHASE ORDERS CRUD & GOODS RECEIVING
// ========================
router.get('/purchase-orders', auth_1.authenticate, (0, auth_1.authorize)('po:read'), async (req, res, next) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '20', 10);
        const status = req.query.status;
        const skip = (page - 1) * limit;
        const where = {};
        if (status)
            where.status = status;
        const [total, pos] = await Promise.all([
            db_1.default.purchaseOrder.count({ where }),
            db_1.default.purchaseOrder.findMany({
                where,
                skip,
                take: limit,
                include: {
                    supplier: true,
                    destinationLocation: true,
                    items: { include: { product: true } },
                    createdBy: { select: { name: true, email: true } }
                },
                orderBy: { createdAt: 'desc' }
            })
        ]);
        res.json({
            data: pos,
            meta: { total, page, limit, pages: Math.ceil(total / limit) }
        });
    }
    catch (err) {
        next(err);
    }
});
router.post('/purchase-orders', auth_1.authenticate, (0, auth_1.authorize)('po:write'), (0, validate_1.validate)(schemas_1.PurchaseOrderCreateSchema), async (req, res, next) => {
    try {
        const { supplierId, destinationLocationId, notes, expectedDate, items } = req.body;
        const userId = req.user?.id;
        const poNumber = `PO-${Date.now().toString().slice(-6)}`;
        const totalAmount = items.reduce((acc, item) => acc + item.orderedQuantity * item.unitCost, 0);
        const po = await db_1.default.purchaseOrder.create({
            data: {
                poNumber,
                supplierId,
                destinationLocationId,
                status: 'DRAFT',
                totalAmount,
                notes,
                expectedDate: expectedDate ? new Date(expectedDate) : null,
                createdById: userId || null,
                items: {
                    create: items.map((i) => ({
                        productId: i.productId,
                        orderedQuantity: i.orderedQuantity,
                        receivedQuantity: 0,
                        unitCost: i.unitCost
                    }))
                }
            },
            include: {
                supplier: true,
                destinationLocation: true,
                items: { include: { product: true } }
            }
        });
        await (0, audit_1.logAudit)(req, 'CREATE_PURCHASE_ORDER', 'PurchaseOrder', po.id, { poNumber, totalAmount });
        res.status(201).json(po);
    }
    catch (err) {
        next(err);
    }
});
// Update PO Status (DRAFT -> SENT -> CANCELLED)
router.patch('/purchase-orders/:id/status', auth_1.authenticate, (0, auth_1.authorize)('po:write'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // SENT, CANCELLED
        const po = await db_1.default.purchaseOrder.update({
            where: { id },
            data: { status },
            include: { supplier: true, destinationLocation: true, items: true }
        });
        await (0, audit_1.logAudit)(req, 'UPDATE_PO_STATUS', 'PurchaseOrder', id, { status });
        res.json(po);
    }
    catch (err) {
        next(err);
    }
});
// GOODS RECEIVING (Increases stock and logs ledger)
router.post('/purchase-orders/:id/receive', auth_1.authenticate, (0, auth_1.authorize)('po:receive'), (0, validate_1.validate)(schemas_1.PurchaseOrderReceiveSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { items } = req.body; // array of { productId, receivedQuantity }
        const userId = req.user?.id;
        const po = await db_1.default.$transaction(async (tx) => {
            const existingPo = await tx.purchaseOrder.findUnique({
                where: { id },
                include: { items: true, destinationLocation: true, supplier: true }
            });
            if (!existingPo)
                throw new Error('Purchase order not found');
            if (existingPo.status === 'RECEIVED')
                throw new Error('PO already fully received');
            if (existingPo.status === 'CANCELLED')
                throw new Error('Cannot receive cancelled PO');
            for (const item of items) {
                const poItem = existingPo.items.find(i => i.productId === item.productId);
                if (!poItem)
                    continue;
                const newReceivedTotal = poItem.receivedQuantity + item.receivedQuantity;
                await tx.purchaseOrderItem.update({
                    where: { id: poItem.id },
                    data: { receivedQuantity: newReceivedTotal }
                });
                // Increase destination stock
                let stock = await tx.stock.findUnique({
                    where: { productId_locationId: { productId: item.productId, locationId: existingPo.destinationLocationId } }
                });
                if (!stock) {
                    stock = await tx.stock.create({
                        data: {
                            productId: item.productId,
                            locationId: existingPo.destinationLocationId,
                            quantityOnHand: 0,
                            quantityReserved: 0,
                            version: 0
                        }
                    });
                }
                const beforeQty = stock.quantityOnHand;
                const afterQty = beforeQty + item.receivedQuantity;
                await tx.stock.update({
                    where: { id: stock.id, version: stock.version },
                    data: {
                        quantityOnHand: afterQty,
                        version: { increment: 1 }
                    }
                });
                // Movement ledger
                await tx.stockMovement.create({
                    data: {
                        productId: item.productId,
                        locationId: existingPo.destinationLocationId,
                        type: 'RECEIPT',
                        changeQuantity: item.receivedQuantity,
                        beforeQuantity: beforeQty,
                        afterQuantity: afterQty,
                        referenceType: 'PO',
                        referenceId: existingPo.poNumber,
                        reason: `Goods received from supplier ${existingPo.supplier.name}`,
                        userId: userId || null
                    }
                });
            }
            // Check if fully or partially received
            const refreshedPo = await tx.purchaseOrder.findUniqueOrThrow({
                where: { id },
                include: { items: true }
            });
            const isFullyReceived = refreshedPo.items.every(i => i.receivedQuantity >= i.orderedQuantity);
            const newStatus = isFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
            return tx.purchaseOrder.update({
                where: { id },
                data: {
                    status: newStatus,
                    receivedDate: isFullyReceived ? new Date() : existingPo.receivedDate
                },
                include: {
                    supplier: true,
                    destinationLocation: true,
                    items: { include: { product: true } }
                }
            });
        });
        if (po.status === 'RECEIVED') {
            (0, webhookDispatcher_1.dispatchWebhook)('po.received', {
                poId: po.id,
                poNumber: po.poNumber,
                supplier: po.supplier.name,
                location: po.destinationLocation.name,
                receivedDate: po.receivedDate
            });
        }
        (0, sse_1.broadcastSSE)('stock:po_received', { poNumber: po.poNumber, status: po.status });
        await (0, audit_1.logAudit)(req, 'RECEIVE_PO_ITEMS', 'PurchaseOrder', id, { poNumber: po.poNumber, status: po.status });
        res.json(po);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.default = router;
