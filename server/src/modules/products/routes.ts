import { Router, Request, Response, NextFunction } from 'express';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import prisma from '../../db';
import { authenticate, authorize, AuthRequest } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { upload } from '../../middlewares/upload';
import { logAudit } from '../../middlewares/audit';
import { ProductSchema, CategorySchema } from '../../shared/schemas';

const router = Router();

// ========================
// CATEGORIES
// ========================

router.get('/categories', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' }
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

router.post('/categories', authenticate, authorize('products:write'), validate(CategorySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description } = req.body;
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) {
      res.status(400).json({ error: 'Category already exists' });
      return;
    }

    const category = await prisma.category.create({
      data: { name, description }
    });

    await logAudit(req, 'CREATE_CATEGORY', 'Category', category.id, { name });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
});

router.patch('/categories/:id', authenticate, authorize('products:write'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const category = await prisma.category.update({
      where: { id },
      data: { name, description }
    });

    await logAudit(req, 'UPDATE_CATEGORY', 'Category', id, { name });
    res.json(category);
  } catch (err) {
    next(err);
  }
});

router.delete('/categories/:id', authenticate, authorize('products:write'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const count = await prisma.product.count({ where: { categoryId: id } });
    if (count > 0) {
      res.status(400).json({ error: 'Cannot delete category that still has products assigned' });
      return;
    }

    await prisma.category.delete({ where: { id } });
    await logAudit(req, 'DELETE_CATEGORY', 'Category', id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ========================
// PRODUCTS CRUD & SEARCH
// ========================

router.get('/', authenticate, authorize('products:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const search = (req.query.search as string || '').trim();
    const categoryId = req.query.categoryId as string | undefined;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
        { description: { contains: search } }
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (isActive !== undefined) where.isActive = isActive;

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
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
  } catch (err) {
    next(err);
  }
});

// Get single product by ID
router.get('/:id', authenticate, authorize('products:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
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
  } catch (err) {
    next(err);
  }
});

// Create product
router.post('/', authenticate, authorize('products:write'), validate(ProductSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { sku, barcode, name, description, categoryId, price, cost, reorderLevel, maxLevel, imageUrl, isActive } = req.body;

    const existingSku = await prisma.product.findUnique({ where: { sku } });
    if (existingSku) {
      res.status(400).json({ error: `SKU '${sku}' already exists` });
      return;
    }

    const existingBarcode = await prisma.product.findUnique({ where: { barcode } });
    if (existingBarcode) {
      res.status(400).json({ error: `Barcode '${barcode}' already exists` });
      return;
    }

    const product = await prisma.product.create({
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

    await logAudit(req, 'CREATE_PRODUCT', 'Product', product.id, { sku, name, price });
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

// Update product
router.patch('/:id', authenticate, authorize('products:write'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { sku, barcode, name, description, categoryId, price, cost, reorderLevel, maxLevel, imageUrl, isActive } = req.body;

    const data: any = {};
    if (sku !== undefined) data.sku = sku;
    if (barcode !== undefined) data.barcode = barcode;
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (categoryId !== undefined) data.categoryId = categoryId;
    if (price !== undefined) data.price = Number(price);
    if (cost !== undefined) data.cost = Number(cost);
    if (reorderLevel !== undefined) data.reorderLevel = parseInt(reorderLevel, 10);
    if (maxLevel !== undefined) data.maxLevel = parseInt(maxLevel, 10);
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (isActive !== undefined) data.isActive = isActive;

    const product = await prisma.product.update({
      where: { id },
      data,
      include: { category: true }
    });

    await logAudit(req, 'UPDATE_PRODUCT', 'Product', id, data);
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// Delete product
router.delete('/:id', authenticate, authorize('products:write'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Check if product is in stock or in orders
    const stockCount = await prisma.stock.aggregate({
      where: { productId: id },
      _sum: { quantityOnHand: true }
    });

    if ((stockCount._sum.quantityOnHand || 0) > 0) {
      res.status(400).json({ error: 'Cannot delete product with existing inventory on hand. Adjust stock to 0 first or deactivate.' });
      return;
    }

    await prisma.product.delete({ where: { id } });
    await logAudit(req, 'DELETE_PRODUCT', 'Product', id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Image Upload Endpoint
router.post('/upload-image', authenticate, authorize('products:write'), upload.single('image'), (req: Request, res: Response) => {
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
router.get('/export/csv', authenticate, authorize('products:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await prisma.product.findMany({
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

    const csvData = stringify(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    res.send(csvData);
  } catch (err) {
    next(err);
  }
});

// Import products from CSV
router.post('/import/csv', authenticate, authorize('products:write'), upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'CSV file is required' });
      return;
    }

    const fileContent = req.file.path ? require('fs').readFileSync(req.file.path, 'utf8') : '';
    const records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });

    let created = 0;
    let updated = 0;

    for (const record of records) {
      if (!record.sku || !record.name) continue;

      let category = await prisma.category.findFirst({
        where: { name: record.category || 'General' }
      });
      if (!category) {
        category = await prisma.category.create({
          data: { name: record.category || 'General', description: 'Auto-created category' }
        });
      }

      const existing = await prisma.product.findUnique({
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
        await prisma.product.update({
          where: { id: existing.id },
          data: payload
        });
        updated++;
      } else {
        await prisma.product.create({
          data: {
            sku: record.sku,
            ...payload
          }
        });
        created++;
      }
    }

    await logAudit(req, 'CSV_IMPORT_PRODUCTS', 'Product', null, { created, updated, total: records.length });
    res.json({ message: 'Products imported successfully', created, updated, total: records.length });
  } catch (err) {
    next(err);
  }
});

export default router;
