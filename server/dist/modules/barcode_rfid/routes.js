"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulatedRFIDReader = void 0;
const express_1 = require("express");
const db_1 = __importDefault(require("../../db"));
const auth_1 = require("../../middlewares/auth");
const router = (0, express_1.Router)();
// Simulated RFID Reader implementation
class SimulatedRFIDReader {
    connected = false;
    async connect() {
        this.connected = true;
        return true;
    }
    async disconnect() {
        this.connected = false;
        return true;
    }
    async readInventory() {
        if (!this.connected)
            throw new Error('RFID Reader is not connected');
        // Fetch random active products to simulate RFID portal/handheld scan
        const products = await db_1.default.product.findMany({
            where: { isActive: true },
            take: 8
        });
        return products.map(p => ({
            epc: `EPC96-${Buffer.from(p.sku).toString('hex').slice(0, 16).toUpperCase()}`,
            sku: p.sku,
            locationCode: 'WH-MAIN',
            rssi: Math.floor(Math.random() * 30) - 70, // -70 to -40 dBm
            timestamp: new Date().toISOString()
        }));
    }
}
exports.SimulatedRFIDReader = SimulatedRFIDReader;
const rfidReaderInstance = new SimulatedRFIDReader();
// Trigger RFID Scan Simulation
router.post('/rfid/scan', auth_1.authenticate, (0, auth_1.authorize)('inventory:read'), async (req, res, next) => {
    try {
        await rfidReaderInstance.connect();
        const tags = await rfidReaderInstance.readInventory();
        await rfidReaderInstance.disconnect();
        res.json({
            reader: 'Simulated-RFID-Zebra-FX9600',
            status: 'SUCCESS',
            scannedCount: tags.length,
            tags
        });
    }
    catch (err) {
        next(err);
    }
});
// ========================
// BARCODE LOOKUP & WORKFLOWS
// ========================
// Scan to Lookup (by Barcode or SKU)
router.get('/lookup/:code', auth_1.authenticate, (0, auth_1.authorize)('products:read'), async (req, res, next) => {
    try {
        const { code } = req.params;
        const product = await db_1.default.product.findFirst({
            where: {
                OR: [
                    { barcode: code },
                    { sku: code }
                ]
            },
            include: {
                category: true,
                stocks: { include: { location: true } }
            }
        });
        if (!product) {
            res.status(404).json({ error: `Product with barcode/SKU '${code}' not found` });
            return;
        }
        const totalOnHand = product.stocks.reduce((acc, s) => acc + s.quantityOnHand, 0);
        const totalReserved = product.stocks.reduce((acc, s) => acc + s.quantityReserved, 0);
        res.json({
            product,
            totalOnHand,
            totalReserved,
            totalAvailable: totalOnHand - totalReserved
        });
    }
    catch (err) {
        next(err);
    }
});
// Scan to Pick (Validates item in open sales order)
router.post('/scan-to-pick', auth_1.authenticate, (0, auth_1.authorize)('orders:fulfill'), async (req, res, next) => {
    try {
        const { orderId, barcode, quantityPicked } = req.body;
        const qty = quantityPicked || 1;
        const order = await db_1.default.salesOrder.findUnique({
            where: { id: orderId },
            include: { items: { include: { product: true } } }
        });
        if (!order) {
            res.status(404).json({ error: 'Sales order not found' });
            return;
        }
        const item = order.items.find(i => i.product.barcode === barcode || i.product.sku === barcode);
        if (!item) {
            res.status(400).json({ error: `Product '${barcode}' does not belong to this sales order` });
            return;
        }
        res.json({
            success: true,
            message: `Verified: ${item.product.name} (SKU: ${item.product.sku}) - Picked ${qty}`,
            item: {
                productId: item.productId,
                productName: item.product.name,
                orderedQuantity: item.quantity,
                barcode: item.product.barcode
            }
        });
    }
    catch (err) {
        next(err);
    }
});
// Scan to Receive (Validates item in PO)
router.post('/scan-to-receive', auth_1.authenticate, (0, auth_1.authorize)('po:receive'), async (req, res, next) => {
    try {
        const { poId, barcode, quantityReceived } = req.body;
        const qty = quantityReceived || 1;
        const po = await db_1.default.purchaseOrder.findUnique({
            where: { id: poId },
            include: { items: { include: { product: true } } }
        });
        if (!po) {
            res.status(404).json({ error: 'Purchase order not found' });
            return;
        }
        const item = po.items.find(i => i.product.barcode === barcode || i.product.sku === barcode);
        if (!item) {
            res.status(400).json({ error: `Product '${barcode}' is not in this purchase order` });
            return;
        }
        res.json({
            success: true,
            message: `Verified: ${item.product.name} ready for receipt of ${qty} units`,
            item: {
                productId: item.productId,
                productName: item.product.name,
                orderedQuantity: item.orderedQuantity,
                receivedQuantity: item.receivedQuantity,
                remainingToReceive: item.orderedQuantity - item.receivedQuantity
            }
        });
    }
    catch (err) {
        next(err);
    }
});
// Barcode Label Print Data Generator
router.get('/label/:productId', auth_1.authenticate, (0, auth_1.authorize)('products:read'), async (req, res, next) => {
    try {
        const { productId } = req.params;
        const product = await db_1.default.product.findUnique({
            where: { id: productId },
            include: { category: true }
        });
        if (!product) {
            res.status(404).json({ error: 'Product not found' });
            return;
        }
        res.json({
            name: product.name,
            sku: product.sku,
            barcode: product.barcode,
            price: product.price,
            category: product.category.name,
            // Provide an SVG barcode representation or standard Code128 pattern
            barcodeDataUrl: `https://barcodeapi.org/api/128/${encodeURIComponent(product.barcode)}`
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
