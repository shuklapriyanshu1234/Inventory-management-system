import { Router, Request, Response, NextFunction } from 'express';
import { stringify } from 'csv-stringify/sync';
import prisma from '../../db';
import { authenticate, authorize, AuthRequest } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { logAudit } from '../../middlewares/audit';
import { broadcastSSE, addSSEClient, removeSSEClient } from './sse';
import { dispatchWebhook } from '../integrations/webhookDispatcher';
import { StockAdjustmentSchema, StockTransferCreateSchema, StockCountCreateSchema } from '../../shared/schemas';

const router = Router();

// ========================
// REAL-TIME SERVER-SENT EVENTS
// ========================
router.get('/sse', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = `${Date.now()}-${Math.random()}`;
  addSSEClient(clientId, res);

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  req.on('close', () => {
    removeSSEClient(clientId);
  });
});

// ========================
// CURRENT STOCK BY LOCATION & PRODUCT
// ========================
router.get('/stock', authenticate, authorize('inventory:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const locationId = req.query.locationId as string | undefined;
    const search = (req.query.search as string || '').trim();
    const filter = req.query.filter as string | undefined; // 'low_stock', 'overstock'

    const where: any = {};
    if (locationId) where.locationId = locationId;
    if (search) {
      where.product = {
        OR: [
          { name: { contains: search } },
          { sku: { contains: search } },
          { barcode: { contains: search } }
        ]
      };
    }

    const stocks = await prisma.stock.findMany({
      where,
      include: {
        product: { include: { category: true } },
        location: true,
      },
      orderBy: { updatedAt: 'desc' }
    });

    let results = stocks.map(s => ({
      id: s.id,
      productId: s.productId,
      productName: s.product.name,
      sku: s.product.sku,
      barcode: s.product.barcode,
      category: s.product.category.name,
      locationId: s.locationId,
      locationName: s.location.name,
      locationCode: s.location.code,
      quantityOnHand: s.quantityOnHand,
      quantityReserved: s.quantityReserved,
      quantityAvailable: s.quantityOnHand - s.quantityReserved,
      reorderLevel: s.product.reorderLevel,
      maxLevel: s.product.maxLevel,
      unitCost: s.product.cost,
      unitPrice: s.product.price,
      totalValue: s.quantityOnHand * s.product.cost,
      isLowStock: s.quantityOnHand <= s.product.reorderLevel,
      isOverStock: s.quantityOnHand >= s.product.maxLevel,
      updatedAt: s.updatedAt,
    }));

    if (filter === 'low_stock') {
      results = results.filter(r => r.isLowStock);
    } else if (filter === 'overstock') {
      results = results.filter(r => r.isOverStock);
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// ========================
// MANUAL STOCK ADJUSTMENT (TRANSACTION + OPTIMISTIC CONCURRENCY)
// ========================
router.post('/adjust', authenticate, authorize('inventory:adjust'), validate(StockAdjustmentSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId, locationId, type, quantity, reason } = req.body;
    const userId = req.user?.id;

    const result = await prisma.$transaction(async (tx) => {
      // Find or create stock record
      let stock = await tx.stock.findUnique({
        where: { productId_locationId: { productId, locationId } }
      });

      if (!stock) {
        stock = await tx.stock.create({
          data: {
            productId,
            locationId,
            quantityOnHand: 0,
            quantityReserved: 0,
            version: 0
          }
        });
      }

      const beforeQuantity = stock.quantityOnHand;
      let afterQuantity: number;
      let changeQuantity: number;

      if (type === 'ADJUSTMENT_IN') {
        changeQuantity = quantity;
        afterQuantity = beforeQuantity + quantity;
      } else {
        changeQuantity = -quantity;
        afterQuantity = beforeQuantity - quantity;
        if (afterQuantity < 0) {
          throw new Error(`Insufficient stock. Current stock on hand is ${beforeQuantity}, cannot deduct ${quantity}.`);
        }
      }

      // Optimistic concurrency update
      const updatedStock = await tx.stock.update({
        where: {
          id: stock.id,
          version: stock.version
        },
        data: {
          quantityOnHand: afterQuantity,
          version: { increment: 1 }
        },
        include: { product: true, location: true }
      });

      // Write ledger entry
      const movement = await tx.stockMovement.create({
        data: {
          productId,
          locationId,
          type,
          changeQuantity,
          beforeQuantity,
          afterQuantity,
          referenceType: 'MANUAL',
          reason,
          userId: userId || null
        }
      });

      return { stock: updatedStock, movement };
    });

    // Check low stock trigger
    if (result.stock.quantityOnHand <= result.stock.product.reorderLevel) {
      dispatchWebhook('stock.low', {
        productId: result.stock.productId,
        sku: result.stock.product.sku,
        name: result.stock.product.name,
        locationId: result.stock.locationId,
        locationName: result.stock.location.name,
        quantityOnHand: result.stock.quantityOnHand,
        reorderLevel: result.stock.product.reorderLevel
      });
    }

    // Broadcast real-time stock change via SSE
    broadcastSSE('stock:updated', {
      productId: result.stock.productId,
      locationId: result.stock.locationId,
      quantityOnHand: result.stock.quantityOnHand,
      quantityReserved: result.stock.quantityReserved
    });

    await logAudit(req, 'ADJUST_STOCK', 'Stock', result.stock.id, {
      productId,
      locationId,
      type,
      quantity,
      beforeQuantity: result.movement.beforeQuantity,
      afterQuantity: result.movement.afterQuantity,
      reason
    });

    res.json(result);
  } catch (err: any) {
    if (err.message.includes('Insufficient stock')) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// ========================
// STOCK TRANSFERS BETWEEN LOCATIONS
// ========================
router.get('/transfers', authenticate, authorize('inventory:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transfers = await prisma.stockTransfer.findMany({
      include: {
        sourceLocation: true,
        targetLocation: true,
        createdBy: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(transfers);
  } catch (err) {
    next(err);
  }
});

router.post('/transfers', authenticate, authorize('inventory:transfer'), validate(StockTransferCreateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { sourceLocationId, targetLocationId, notes, items } = req.body;
    const userId = req.user?.id;

    if (sourceLocationId === targetLocationId) {
      res.status(400).json({ error: 'Source and target location cannot be the same' });
      return;
    }

    const transfer = await prisma.$transaction(async (tx) => {
      const transferNumber = `TRF-${Date.now().toString().slice(-6)}`;

      // Check stock availability at source location
      for (const item of items) {
        const stock = await tx.stock.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: sourceLocationId } }
        });
        const available = stock ? stock.quantityOnHand - stock.quantityReserved : 0;
        if (available < item.quantity) {
          throw new Error(`Insufficient stock for product ${item.productId} at source location. Available: ${available}, Requested: ${item.quantity}`);
        }
      }

      // Deduct from source location
      for (const item of items) {
        const stock = await tx.stock.findUniqueOrThrow({
          where: { productId_locationId: { productId: item.productId, locationId: sourceLocationId } }
        });

        await tx.stock.update({
          where: { id: stock.id, version: stock.version },
          data: {
            quantityOnHand: stock.quantityOnHand - item.quantity,
            version: { increment: 1 }
          }
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            locationId: sourceLocationId,
            type: 'TRANSFER_OUT',
            changeQuantity: -item.quantity,
            beforeQuantity: stock.quantityOnHand,
            afterQuantity: stock.quantityOnHand - item.quantity,
            referenceType: 'TRANSFER',
            referenceId: transferNumber,
            reason: `Transfer to target location`,
            userId: userId || null
          }
        });
      }

      const createdTransfer = await tx.stockTransfer.create({
        data: {
          transferNumber,
          sourceLocationId,
          targetLocationId,
          notes,
          status: 'IN_TRANSIT',
          createdById: userId || null,
          items: {
            create: items.map((i: any) => ({
              productId: i.productId,
              requestedQuantity: i.quantity,
              receivedQuantity: 0
            }))
          }
        },
        include: {
          items: { include: { product: true } },
          sourceLocation: true,
          targetLocation: true
        }
      });

      return createdTransfer;
    });

    broadcastSSE('stock:transfer_created', { transferNumber: transfer.transferNumber });
    await logAudit(req, 'CREATE_TRANSFER', 'StockTransfer', transfer.id, { transferNumber: transfer.transferNumber });

    res.status(201).json(transfer);
  } catch (err: any) {
    if (err.message.includes('Insufficient stock')) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// Receive / Complete Transfer
router.post('/transfers/:id/receive', authenticate, authorize('inventory:transfer'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const transfer = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockTransfer.findUnique({
        where: { id },
        include: { items: true }
      });

      if (!existing) throw new Error('Transfer not found');
      if (existing.status === 'COMPLETED') throw new Error('Transfer is already completed');
      if (existing.status === 'CANCELLED') throw new Error('Transfer was cancelled');

      // Add to destination location
      for (const item of existing.items) {
        let destStock = await tx.stock.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: existing.targetLocationId } }
        });

        if (!destStock) {
          destStock = await tx.stock.create({
            data: {
              productId: item.productId,
              locationId: existing.targetLocationId,
              quantityOnHand: 0,
              quantityReserved: 0,
              version: 0
            }
          });
        }

        const before = destStock.quantityOnHand;
        const after = before + item.requestedQuantity;

        await tx.stock.update({
          where: { id: destStock.id, version: destStock.version },
          data: {
            quantityOnHand: after,
            version: { increment: 1 }
          }
        });

        await tx.stockTransferItem.update({
          where: { id: item.id },
          data: { receivedQuantity: item.requestedQuantity }
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            locationId: existing.targetLocationId,
            type: 'TRANSFER_IN',
            changeQuantity: item.requestedQuantity,
            beforeQuantity: before,
            afterQuantity: after,
            referenceType: 'TRANSFER',
            referenceId: existing.transferNumber,
            reason: `Transfer received from source`,
            userId: userId || null
          }
        });
      }

      const completed = await tx.stockTransfer.update({
        where: { id },
        data: { status: 'COMPLETED' },
        include: { items: true, sourceLocation: true, targetLocation: true }
      });

      return completed;
    });

    broadcastSSE('stock:transfer_completed', { transferNumber: transfer.transferNumber });
    await logAudit(req, 'RECEIVE_TRANSFER', 'StockTransfer', transfer.id, { transferNumber: transfer.transferNumber });

    res.json(transfer);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ========================
// CYCLE / PHYSICAL STOCK COUNTS & VARIANCE RECONCILIATION
// ========================
router.get('/counts', authenticate, authorize('inventory:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const counts = await prisma.stockCount.findMany({
      include: {
        location: true,
        conductedBy: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(counts);
  } catch (err) {
    next(err);
  }
});

router.post('/counts', authenticate, authorize('inventory:adjust'), validate(StockCountCreateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { locationId, notes, items } = req.body;
    const userId = req.user?.id;
    const countNumber = `CNT-${Date.now().toString().slice(-6)}`;

    // Build items with system stock and variance
    const count = await prisma.$transaction(async (tx) => {
      const countRecords = [];

      for (const item of items) {
        const stock = await tx.stock.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId } }
        });
        const systemQuantity = stock ? stock.quantityOnHand : 0;
        const variance = item.countedQuantity - systemQuantity;

        countRecords.push({
          productId: item.productId,
          systemQuantity,
          countedQuantity: item.countedQuantity,
          variance
        });
      }

      return tx.stockCount.create({
        data: {
          countNumber,
          locationId,
          notes,
          status: 'IN_PROGRESS',
          conductedById: userId || null,
          items: {
            create: countRecords
          }
        },
        include: {
          items: { include: { product: true } },
          location: true
        }
      });
    });

    await logAudit(req, 'CREATE_STOCK_COUNT', 'StockCount', count.id, { countNumber });
    res.status(201).json(count);
  } catch (err) {
    next(err);
  }
});

// Reconcile Cycle Count (Applies variances to stock and writes ledger)
router.post('/counts/:id/reconcile', authenticate, authorize('inventory:adjust'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const reconciled = await prisma.$transaction(async (tx) => {
      const stockCount = await tx.stockCount.findUnique({
        where: { id },
        include: { items: true }
      });

      if (!stockCount) throw new Error('Stock count not found');
      if (stockCount.status === 'RECONCILED') throw new Error('Stock count is already reconciled');

      for (const item of stockCount.items) {
        if (item.variance === 0) continue;

        let stock = await tx.stock.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: stockCount.locationId } }
        });

        if (!stock) {
          stock = await tx.stock.create({
            data: {
              productId: item.productId,
              locationId: stockCount.locationId,
              quantityOnHand: 0,
              quantityReserved: 0,
              version: 0
            }
          });
        }

        const before = stock.quantityOnHand;
        const after = item.countedQuantity;
        const type = item.variance > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

        await tx.stock.update({
          where: { id: stock.id, version: stock.version },
          data: {
            quantityOnHand: after,
            version: { increment: 1 }
          }
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            locationId: stockCount.locationId,
            type,
            changeQuantity: item.variance,
            beforeQuantity: before,
            afterQuantity: after,
            referenceType: 'CYCLE_COUNT',
            referenceId: stockCount.countNumber,
            reason: `Reconciliation variance of ${item.variance}`,
            userId: userId || null
          }
        });
      }

      return tx.stockCount.update({
        where: { id },
        data: { status: 'RECONCILED' },
        include: { items: { include: { product: true } }, location: true }
      });
    });

    broadcastSSE('stock:reconciled', { countNumber: reconciled.countNumber });
    await logAudit(req, 'RECONCILE_STOCK_COUNT', 'StockCount', id, { countNumber: reconciled.countNumber });

    res.json(reconciled);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ========================
// STOCK MOVEMENT LEDGER
// ========================
router.get('/ledger', authenticate, authorize('inventory:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '30', 10);
    const productId = req.query.productId as string | undefined;
    const locationId = req.query.locationId as string | undefined;
    const type = req.query.type as string | undefined;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (productId) where.productId = productId;
    if (locationId) where.locationId = locationId;
    if (type) where.type = type;

    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        include: {
          product: true,
          location: true,
          user: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    res.json({
      data: movements,
      meta: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// Export Ledger to CSV
router.get('/ledger/export/csv', authenticate, authorize('inventory:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const movements = await prisma.stockMovement.findMany({
      include: {
        product: true,
        location: true,
        user: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 2000
    });

    const rows = movements.map(m => ({
      id: m.id,
      timestamp: m.createdAt.toISOString(),
      productSku: m.product.sku,
      productName: m.product.name,
      location: m.location.name,
      movementType: m.type,
      changeQuantity: m.changeQuantity,
      beforeQuantity: m.beforeQuantity,
      afterQuantity: m.afterQuantity,
      referenceType: m.referenceType || '',
      referenceId: m.referenceId || '',
      reason: m.reason || '',
      user: m.user?.name || 'System'
    }));

    const csvData = stringify(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="stock_movements_ledger.csv"');
    res.send(csvData);
  } catch (err) {
    next(err);
  }
});

export default router;
