import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../../db';
import { authenticate, requireRole, AuthRequest } from '../../middlewares/auth';
import { logAudit } from '../../middlewares/audit';

const router = Router();

export async function runMigrationFromLegacyJson(filePath: string, userId?: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Legacy JSON file not found at path: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const items: Array<{ id: string; name: string; quantity: number; price: number }> = JSON.parse(raw);

  // 1. Ensure a default Category and Location exist
  let category = await prisma.category.findFirst({ where: { name: 'General Merchandise' } });
  if (!category) {
    category = await prisma.category.create({
      data: { name: 'General Merchandise', description: 'Migrated from legacy store catalog' }
    });
  }

  let location = await prisma.location.findFirst({ where: { code: 'WH-MAIN' } });
  if (!location) {
    location = await prisma.location.create({
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
    const existing = await prisma.product.findFirst({
      where: { OR: [{ barcode }, { sku }] }
    });

    let productId: string;

    if (existing) {
      const updated = await prisma.product.update({
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
    } else {
      const created = await prisma.product.create({
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
    const existingStock = await prisma.stock.findUnique({
      where: { productId_locationId: { productId, locationId: location.id } }
    });

    if (existingStock) {
      const diff = quantity - existingStock.quantityOnHand;
      if (diff !== 0) {
        await prisma.stock.update({
          where: { id: existingStock.id },
          data: {
            quantityOnHand: quantity,
            version: { increment: 1 }
          }
        });

        await prisma.stockMovement.create({
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
    } else {
      await prisma.stock.create({
        data: {
          productId,
          locationId: location.id,
          quantityOnHand: quantity,
          quantityReserved: 0
        }
      });

      await prisma.stockMovement.create({
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
router.post('/import-prototype', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const legacyPath = path.resolve(process.cwd(), '../legacy_inventory.json');
    const result = await runMigrationFromLegacyJson(legacyPath, req.user?.id);

    await logAudit(req, 'MIGRATE_PROTOTYPE_DATA', 'Product', null, result);
    res.json({
      message: 'Legacy prototype data successfully migrated to database',
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
