import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../../db';
import { authenticate, authorize, AuthRequest } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { logAudit } from '../../middlewares/audit';
import { ApiKeyCreateSchema, WebhookCreateSchema } from '../../shared/schemas';

const router = Router();

// ========================
// API KEYS MANAGEMENT
// ========================
router.get('/keys', authenticate, authorize('integrations:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(keys);
  } catch (err) {
    next(err);
  }
});

router.post('/keys', authenticate, authorize('integrations:manage'), validate(ApiKeyCreateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, role } = req.body;
    const generatedKey = `xyz_${crypto.randomBytes(24).toString('hex')}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        key: generatedKey,
        name,
        role: role || 'MANAGER'
      }
    });

    await logAudit(req, 'CREATE_API_KEY', 'ApiKey', apiKey.id, { name, role });
    res.status(201).json(apiKey);
  } catch (err) {
    next(err);
  }
});

router.delete('/keys/:id', authenticate, authorize('integrations:manage'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await prisma.apiKey.delete({ where: { id } });
    await logAudit(req, 'DELETE_API_KEY', 'ApiKey', id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ========================
// WEBHOOKS MANAGEMENT
// ========================
router.get('/webhooks', authenticate, authorize('integrations:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      include: {
        deliveries: {
          take: 10,
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(webhooks);
  } catch (err) {
    next(err);
  }
});

router.post('/webhooks', authenticate, authorize('integrations:manage'), validate(WebhookCreateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { url, events, secret } = req.body;

    const webhook = await prisma.webhook.create({
      data: {
        url,
        events: Array.isArray(events) ? events.join(',') : events,
        secret
      }
    });

    await logAudit(req, 'CREATE_WEBHOOK', 'Webhook', webhook.id, { url });
    res.status(201).json(webhook);
  } catch (err) {
    next(err);
  }
});

router.delete('/webhooks/:id', authenticate, authorize('integrations:manage'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await prisma.webhook.delete({ where: { id } });
    await logAudit(req, 'DELETE_WEBHOOK', 'Webhook', id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ========================
// ERP & ACCOUNTING SYSTEM ADAPTERS
// ========================
// Adapter interface implementations:
// 1. ERP Inventory Sync Adapter (SAP / Oracle NetSuite format)
// 2. Accounting General Ledger Journal Entries Export (QuickBooks / Xero format)

router.get('/adapters/erp/inventory-sync', authenticate, authorize('integrations:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stocks = await prisma.stock.findMany({
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
  } catch (err) {
    next(err);
  }
});

router.get('/adapters/accounting/journal-entries', authenticate, authorize('integrations:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const movements = await prisma.stockMovement.findMany({
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
  } catch (err) {
    next(err);
  }
});

export default router;
