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
// CUSTOMERS CRUD
// ========================
router.get('/customers', auth_1.authenticate, async (req, res, next) => {
    try {
        const customers = await db_1.default.customer.findMany({
            include: { _count: { select: { orders: true } } },
            orderBy: { name: 'asc' }
        });
        res.json(customers);
    }
    catch (err) {
        next(err);
    }
});
router.post('/customers', auth_1.authenticate, (0, auth_1.authorize)('orders:write'), (0, validate_1.validate)(schemas_1.CustomerSchema), async (req, res, next) => {
    try {
        const { name, email, phone, address } = req.body;
        const existing = await db_1.default.customer.findUnique({ where: { email } });
        if (existing) {
            res.status(400).json({ error: 'Customer email already exists' });
            return;
        }
        const customer = await db_1.default.customer.create({
            data: { name, email, phone, address }
        });
        await (0, audit_1.logAudit)(req, 'CREATE_CUSTOMER', 'Customer', customer.id, { name, email });
        res.status(201).json(customer);
    }
    catch (err) {
        next(err);
    }
});
// ========================
// SALES ORDERS
// ========================
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('orders:read'), async (req, res, next) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '20', 10);
        const status = req.query.status;
        const search = (req.query.search || '').trim();
        const skip = (page - 1) * limit;
        const where = {};
        if (status)
            where.status = status;
        if (search) {
            where.OR = [
                { orderNumber: { contains: search } },
                { customer: { name: { contains: search } } }
            ];
        }
        const [total, orders] = await Promise.all([
            db_1.default.salesOrder.count({ where }),
            db_1.default.salesOrder.findMany({
                where,
                skip,
                take: limit,
                include: {
                    customer: true,
                    location: true,
                    items: { include: { product: true } },
                    timeline: { orderBy: { createdAt: 'asc' } },
                    createdBy: { select: { id: true, name: true, email: true } }
                },
                orderBy: { createdAt: 'desc' }
            })
        ]);
        res.json({
            data: orders,
            meta: { total, page, limit, pages: Math.ceil(total / limit) }
        });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('orders:read'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await db_1.default.salesOrder.findUnique({
            where: { id },
            include: {
                customer: true,
                location: true,
                items: { include: { product: true } },
                timeline: {
                    include: { createdBy: { select: { name: true } } },
                    orderBy: { createdAt: 'asc' }
                },
                createdBy: { select: { id: true, name: true, email: true } }
            }
        });
        if (!order) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }
        res.json(order);
    }
    catch (err) {
        next(err);
    }
});
// Create Order (STOCK RESERVATION & BACKORDER HANDLING)
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('orders:write'), (0, validate_1.validate)(schemas_1.SalesOrderCreateSchema), async (req, res, next) => {
    try {
        const { customerId, locationId, notes, items } = req.body;
        const userId = req.user?.id;
        const orderNumber = `SO-${Date.now().toString().slice(-6)}`;
        const order = await db_1.default.$transaction(async (tx) => {
            let totalAmount = 0;
            const orderItemsData = [];
            for (const item of items) {
                const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
                totalAmount += product.price * item.quantity;
                // Check stock availability
                let stock = await tx.stock.findUnique({
                    where: { productId_locationId: { productId: item.productId, locationId } }
                });
                if (!stock) {
                    stock = await tx.stock.create({
                        data: {
                            productId: item.productId,
                            locationId,
                            quantityOnHand: 0,
                            quantityReserved: 0,
                            version: 0
                        }
                    });
                }
                const available = stock.quantityOnHand - stock.quantityReserved;
                let reservedAmount = 0;
                let backorderedAmount = 0;
                if (available >= item.quantity) {
                    reservedAmount = item.quantity;
                }
                else if (available > 0) {
                    reservedAmount = available;
                    backorderedAmount = item.quantity - available;
                }
                else {
                    reservedAmount = 0;
                    backorderedAmount = item.quantity;
                }
                // Reserve stock
                if (reservedAmount > 0) {
                    await tx.stock.update({
                        where: { id: stock.id, version: stock.version },
                        data: {
                            quantityReserved: stock.quantityReserved + reservedAmount,
                            version: { increment: 1 }
                        }
                    });
                }
                orderItemsData.push({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: product.price,
                    backorderedQuantity: backorderedAmount
                });
            }
            const createdOrder = await tx.salesOrder.create({
                data: {
                    orderNumber,
                    customerId,
                    locationId,
                    status: 'PLACED',
                    totalAmount,
                    notes,
                    createdById: userId || null,
                    items: {
                        create: orderItemsData
                    },
                    timeline: {
                        create: {
                            status: 'PLACED',
                            notes: 'Order placed by customer/sales',
                            createdById: userId || null
                        }
                    }
                },
                include: {
                    items: { include: { product: true } },
                    customer: true,
                    location: true,
                    timeline: true
                }
            });
            return createdOrder;
        });
        (0, webhookDispatcher_1.dispatchWebhook)('order.created', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customer: order.customer.name,
            totalAmount: order.totalAmount,
            itemsCount: order.items.length
        });
        (0, sse_1.broadcastSSE)('order:created', { orderNumber: order.orderNumber });
        await (0, audit_1.logAudit)(req, 'CREATE_ORDER', 'SalesOrder', order.id, { orderNumber: order.orderNumber, totalAmount: order.totalAmount });
        res.status(201).json(order);
    }
    catch (err) {
        next(err);
    }
});
// Update Order Status (PLACED -> PICKED -> PACKED -> SHIPPED -> DELIVERED / CANCELLED)
router.patch('/:id/status', auth_1.authenticate, (0, auth_1.authorize)('orders:fulfill'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body; // PLACED, PICKED, PACKED, SHIPPED, DELIVERED, CANCELLED
        const userId = req.user?.id;
        const updatedOrder = await db_1.default.$transaction(async (tx) => {
            const order = await tx.salesOrder.findUnique({
                where: { id },
                include: { items: true, location: true }
            });
            if (!order)
                throw new Error('Order not found');
            if (order.status === 'DELIVERED')
                throw new Error('Order is already delivered');
            if (order.status === 'CANCELLED')
                throw new Error('Order is already cancelled');
            // State transitions and stock logic
            if (status === 'SHIPPED' && order.status !== 'SHIPPED') {
                // Stock deduction on shipment: reduce onHand AND release reserved
                for (const item of order.items) {
                    const deliverableQty = item.quantity - item.backorderedQuantity;
                    if (deliverableQty <= 0)
                        continue;
                    const stock = await tx.stock.findUniqueOrThrow({
                        where: { productId_locationId: { productId: item.productId, locationId: order.locationId } }
                    });
                    await tx.stock.update({
                        where: { id: stock.id, version: stock.version },
                        data: {
                            quantityOnHand: stock.quantityOnHand - deliverableQty,
                            quantityReserved: Math.max(0, stock.quantityReserved - deliverableQty),
                            version: { increment: 1 }
                        }
                    });
                    // Ledger movement
                    await tx.stockMovement.create({
                        data: {
                            productId: item.productId,
                            locationId: order.locationId,
                            type: 'SHIPMENT',
                            changeQuantity: -deliverableQty,
                            beforeQuantity: stock.quantityOnHand,
                            afterQuantity: stock.quantityOnHand - deliverableQty,
                            referenceType: 'SALES_ORDER',
                            referenceId: order.orderNumber,
                            reason: `Order shipped to customer`,
                            userId: userId || null
                        }
                    });
                }
            }
            else if (status === 'CANCELLED' && order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
                // Release reserved stock on order cancel
                for (const item of order.items) {
                    const reservedQty = item.quantity - item.backorderedQuantity;
                    if (reservedQty <= 0)
                        continue;
                    const stock = await tx.stock.findUnique({
                        where: { productId_locationId: { productId: item.productId, locationId: order.locationId } }
                    });
                    if (stock) {
                        await tx.stock.update({
                            where: { id: stock.id, version: stock.version },
                            data: {
                                quantityReserved: Math.max(0, stock.quantityReserved - reservedQty),
                                version: { increment: 1 }
                            }
                        });
                    }
                }
            }
            // Record timeline history
            await tx.orderTimeline.create({
                data: {
                    orderId: order.id,
                    status,
                    notes: notes || `Status changed to ${status}`,
                    createdById: userId || null
                }
            });
            return tx.salesOrder.update({
                where: { id },
                data: { status },
                include: {
                    customer: true,
                    location: true,
                    items: { include: { product: true } },
                    timeline: { orderBy: { createdAt: 'asc' } }
                }
            });
        });
        (0, sse_1.broadcastSSE)('order:status_updated', { orderNumber: updatedOrder.orderNumber, status });
        await (0, audit_1.logAudit)(req, 'UPDATE_ORDER_STATUS', 'SalesOrder', id, { status, notes });
        res.json(updatedOrder);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Printable Pick List & Packing Slip / Invoice (HTML or JSON)
router.get('/:id/packing-slip', auth_1.authenticate, (0, auth_1.authorize)('orders:read'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await db_1.default.salesOrder.findUnique({
            where: { id },
            include: {
                customer: true,
                location: true,
                items: { include: { product: { include: { category: true } } } },
                createdBy: { select: { name: true } }
            }
        });
        if (!order) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }
        res.json({
            title: 'PACKING SLIP & PICK LIST',
            company: 'XYZ Retail Corporation',
            orderNumber: order.orderNumber,
            orderDate: order.createdAt,
            status: order.status,
            customer: order.customer,
            dispatchLocation: order.location,
            items: order.items.map(i => ({
                sku: i.product.sku,
                barcode: i.product.barcode,
                name: i.product.name,
                category: i.product.category.name,
                ordered: i.quantity,
                pickQuantity: i.quantity - i.backorderedQuantity,
                backordered: i.backorderedQuantity,
                unitPrice: i.unitPrice,
                subtotal: (i.quantity - i.backorderedQuantity) * i.unitPrice
            })),
            totalAmount: order.totalAmount
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
