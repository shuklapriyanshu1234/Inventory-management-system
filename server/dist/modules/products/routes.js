"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sync_1 = require("csv-parse/sync");
const sync_2 = require("csv-stringify/sync");
const db_1 = __importDefault(require("../../db"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const upload_1 = require("../../middlewares/upload");
const audit_1 = require("../../middlewares/audit");
const schemas_1 = require("../../shared/schemas");
const router = (0, express_1.Router)();
// ========================
// CATEGORIES
// ========================
router.get('/categories', auth_1.authenticate, async (req, res, next) => {
    try {
        const categories = await db_1.default.category.findMany({
            include: { _count: { select: { products: true } } },
            orderBy: { name: 'asc' }
        });
        res.json(categories);
    }
    catch (err) {
        next(err);
    }
});
router.post('/categories', auth_1.authenticate, (0, auth_1.authorize)('products:write'), (0, validate_1.validate)(schemas_1.CategorySchema), async (req, res, next) => {
    try {
        const { name, description } = req.body;
        const existing = await db_1.default.category.findUnique({ where: { name } });
        if (existing) {
            res.status(400).json({ error: 'Category already exists' });
            return;
        }
        const category = await db_1.default.category.create({
            data: { name, description }
        });
        await (0, audit_1.logAudit)(req, 'CREATE_CATEGORY', 'Category', category.id, { name });
        res.status(201).json(category);
    }
    catch (err) {
        next(err);
    }
});
router.patch('/categories/:id', auth_1.authenticate, (0, auth_1.authorize)('products:write'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const category = await db_1.default.category.update({
            where: { id },
            data: { name, description }
        });
        await (0, audit_1.logAudit)(req, 'UPDATE_CATEGORY', 'Category', id, { name });
        res.json(category);
    }
    catch (err) {
        next(err);
    }
});
router.delete('/categories/:id', auth_1.authenticate, (0, auth_1.authorize)('products:write'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const count = await db_1.default.product.count({ where: { categoryId: id } });
        if (count > 0) {
            res.status(400).json({ error: 'Cannot delete category that still has products assigned' });
            return;
        }
        await db_1.default.category.delete({ where: { id } });
        await (0, audit_1.logAudit)(req, 'DELETE_CATEGORY', 'Category', id);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// ========================
// PRODUCTS CRUD & SEARCH
// ========================
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('products:read'), async (req, res, next) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '20', 10);
        const search = (req.query.search || '').trim();
        const categoryId = req.query.categoryId;
        const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
        const skip = (page - 1) * limit;
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { sku: { contains: search } },
                { barcode: { contains: search } },
                { description: { contains: search } }
            ];
        }
        if (categoryId)
            where.categoryId = categoryId;
        if (isActive !== undefined)
            where.isActive = isActive;
        const [total, products] = await Promise.all([
            db_1.default.product.count({ where }),
            db_1.default.product.findMany({
                where,
                skip,
                take: limit,
                include: {
                    category: true,
                    stocks: {
                        include: { location: true }
                    }
                },
                orderBy: { name: 'asc' }
            })
        ]);
        // Format products with total stockOnHand and stockReserved across locations
        const enriched = products.map(p => {
            const totalOnHand = p.stocks.reduce((acc, s) => acc + s.quantityOnHand, 0);
            const totalReserved = p.stocks.reduce((acc, s) => acc + s.quantityReserved, 0);
            return {
                ...p,
                totalOnHand,
                totalReserved,
                totalAvailable: totalOnHand - totalReserved,
                isLowStock: totalOnHand <= p.reorderLevel,
                isOverStock: totalOnHand >= p.maxLevel
            };
        });
        res.json({
            data: enriched,
            meta: { total, page, limit, pages: Math.ceil(total / limit) }
        });
    }
    catch (err) {
        next(err);
    }
});
// Get single product by ID
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('products:read'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const product = await db_1.default.product.findUnique({
            where: { id },
            include: {
                category: true,
                stocks: { include: { location: true } }
            }
        });
        if (!product) {
            res.status(404).json({ error: 'Product not found' });
            return;
        }
        const totalOnHand = product.stocks.reduce((acc, s) => acc + s.quantityOnHand, 0);
        const totalReserved = product.stocks.reduce((acc, s) => acc + s.quantityReserved, 0);
        res.json({
            ...product,
            totalOnHand,
            totalReserved,
            totalAvailable: totalOnHand - totalReserved
        });
    }
    catch (err) {
        next(err);
    }
});
// Create product
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('products:write'), (0, validate_1.validate)(schemas_1.ProductSchema), async (req, res, next) => {
    try {
        const { sku, barcode, name, description, categoryId, price, cost, reorderLevel, maxLevel, imageUrl, isActive } = req.body;
        const existingSku = await db_1.default.product.findUnique({ where: { sku } });
        if (existingSku) {
            res.status(400).json({ error: `SKU '${sku}' already exists` });
            return;
        }
        const existingBarcode = await db_1.default.product.findUnique({ where: { barcode } });
        if (existingBarcode) {
            res.status(400).json({ error: `Barcode '${barcode}' already exists` });
            return;
        }
        const product = await db_1.default.product.create({
            data: {
                sku,
                barcode,
                name,
                description,
                categoryId,
                price,
                cost,
                reorderLevel,
                maxLevel,
                imageUrl,
                isActive: isActive !== undefined ? isActive : true,
            },
            include: { category: true }
        });
        await (0, audit_1.logAudit)(req, 'CREATE_PRODUCT', 'Product', product.id, { sku, name, price });
        res.status(201).json(product);
    }
    catch (err) {
        next(err);
    }
});
// Update product
router.patch('/:id', auth_1.authenticate, (0, auth_1.authorize)('products:write'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { sku, barcode, name, description, categoryId, price, cost, reorderLevel, maxLevel, imageUrl, isActive } = req.body;
        const data = {};
        if (sku !== undefined)
            data.sku = sku;
        if (barcode !== undefined)
            data.barcode = barcode;
        if (name !== undefined)
            data.name = name;
        if (description !== undefined)
            data.description = description;
        if (categoryId !== undefined)
            data.categoryId = categoryId;
        if (price !== undefined)
            data.price = Number(price);
        if (cost !== undefined)
            data.cost = Number(cost);
        if (reorderLevel !== undefined)
            data.reorderLevel = parseInt(reorderLevel, 10);
        if (maxLevel !== undefined)
            data.maxLevel = parseInt(maxLevel, 10);
        if (imageUrl !== undefined)
            data.imageUrl = imageUrl;
        if (isActive !== undefined)
            data.isActive = isActive;
        const product = await db_1.default.product.update({
            where: { id },
            data,
            include: { category: true }
        });
        await (0, audit_1.logAudit)(req, 'UPDATE_PRODUCT', 'Product', id, data);
        res.json(product);
    }
    catch (err) {
        next(err);
    }
});
// Delete product
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('products:write'), async (req, res, next) => {
    try {
        const { id } = req.params;
        // Check if product is in stock or in orders
        const stockCount = await db_1.default.stock.aggregate({
            where: { productId: id },
            _sum: { quantityOnHand: true }
        });
        if ((stockCount._sum.quantityOnHand || 0) > 0) {
            res.status(400).json({ error: 'Cannot delete product with existing inventory on hand. Adjust stock to 0 first or deactivate.' });
            return;
        }
        await db_1.default.product.delete({ where: { id } });
        await (0, audit_1.logAudit)(req, 'DELETE_PRODUCT', 'Product', id);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// Image Upload Endpoint
router.post('/upload-image', auth_1.authenticate, (0, auth_1.authorize)('products:write'), upload_1.upload.single('image'), (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'No image file uploaded' });
        return;
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
});
// ========================
// CSV IMPORT & EXPORT
// ========================
// Export products to CSV
router.get('/export/csv', auth_1.authenticate, (0, auth_1.authorize)('products:read'), async (req, res, next) => {
    try {
        const products = await db_1.default.product.findMany({
            include: {
                category: true,
                stocks: true
            }
        });
        const rows = products.map(p => ({
            sku: p.sku,
            barcode: p.barcode,
            name: p.name,
            description: p.description || '',
            category: p.category.name,
            price: p.price,
            cost: p.cost,
            reorderLevel: p.reorderLevel,
            maxLevel: p.maxLevel,
            isActive: p.isActive,
            totalOnHand: p.stocks.reduce((acc, s) => acc + s.quantityOnHand, 0),
        }));
        const csvData = (0, sync_2.stringify)(rows, { header: true });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
        res.send(csvData);
    }
    catch (err) {
        next(err);
    }
});
// Import products from CSV
router.post('/import/csv', auth_1.authenticate, (0, auth_1.authorize)('products:write'), upload_1.upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'CSV file is required' });
            return;
        }
        const fileContent = req.file.path ? require('fs').readFileSync(req.file.path, 'utf8') : '';
        const records = (0, sync_1.parse)(fileContent, { columns: true, skip_empty_lines: true, trim: true });
        let created = 0;
        let updated = 0;
        for (const record of records) {
            if (!record.sku || !record.name)
                continue;
            let category = await db_1.default.category.findFirst({
                where: { name: record.category || 'General' }
            });
            if (!category) {
                category = await db_1.default.category.create({
                    data: { name: record.category || 'General', description: 'Auto-created category' }
                });
            }
            const existing = await db_1.default.product.findUnique({
                where: { sku: record.sku }
            });
            const payload = {
                name: record.name,
                barcode: record.barcode || `BC-${record.sku}`,
                description: record.description || null,
                categoryId: category.id,
                price: parseFloat(record.price) || 0,
                cost: parseFloat(record.cost) || 0,
                reorderLevel: parseInt(record.reorderLevel, 10) || 10,
                maxLevel: parseInt(record.maxLevel, 10) || 100,
                isActive: record.isActive !== undefined ? record.isActive === 'true' || record.isActive === true : true
            };
            if (existing) {
                await db_1.default.product.update({
                    where: { id: existing.id },
                    data: payload
                });
                updated++;
            }
            else {
                await db_1.default.product.create({
                    data: {
                        sku: record.sku,
                        ...payload
                    }
                });
                created++;
            }
        }
        await (0, audit_1.logAudit)(req, 'CSV_IMPORT_PRODUCTS', 'Product', null, { created, updated, total: records.length });
        res.json({ message: 'Products imported successfully', created, updated, total: records.length });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
