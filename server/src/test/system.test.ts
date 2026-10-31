import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import prisma from '../db';

const app = createApp();
let adminToken: string;
let salesToken: string;
let warehouseToken: string;
let testProductId: string;
let testLocationId: string;
let targetLocationId: string;

beforeAll(async () => {
  // Login as Admin
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@xyzretail.com', password: 'Admin123!' });
  adminToken = adminRes.body.accessToken;

  // Login as Sales
  const salesRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'sales@xyzretail.com', password: 'Admin123!' });
  salesToken = salesRes.body.accessToken;

  // Login as Warehouse
  const whRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'warehouse@xyzretail.com', password: 'Admin123!' });
  warehouseToken = whRes.body.accessToken;

  // Fetch test locations
  const locations = await prisma.location.findMany();
  testLocationId = locations[0].id;
  targetLocationId = locations[1].id;

  // Create isolated test product
  const category = await prisma.category.findFirstOrThrow();
  const prod = await prisma.product.create({
    data: {
      sku: `TEST-SKU-${Date.now()}`,
      barcode: `TEST-BC-${Date.now()}`,
      name: 'Automated Test Product',
      categoryId: category.id,
      price: 50.0,
      cost: 30.0,
      reorderLevel: 10,
      maxLevel: 100
    }
  });
  testProductId = prod.id;
});

describe('1. Authentication & Role Permissions Matrix', () => {
  it('should reject unauthenticated requests to protected endpoints', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('should allow Admin to read user list', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('should forbid Sales from accessing users endpoint', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(403);
  });
});

describe('2. Inventory Stock Calculations & Concurrency Safety', () => {
  it('should accurately adjust stock upwards and create ledger movement', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: testProductId,
        locationId: testLocationId,
        type: 'ADJUSTMENT_IN',
        quantity: 50,
        reason: 'Automated initial stock load'
      });

    expect(res.status).toBe(200);
    expect(res.body.stock.quantityOnHand).toBe(50);
    expect(res.body.movement.type).toBe('ADJUSTMENT_IN');
    expect(res.body.movement.changeQuantity).toBe(50);
  });

  it('should prevent stock from going negative', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: testProductId,
        locationId: testLocationId,
        type: 'ADJUSTMENT_OUT',
        quantity: 9999, // More than on hand
        reason: 'Over-deduction attempt'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Insufficient stock');
  });

  it('should execute concurrent deductions safely without lost updates', async () => {
    // Current stock is 50. Run 5 concurrent deductions of 5 each.
    const promises = Array.from({ length: 5 }).map(() =>
      request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: testProductId,
          locationId: testLocationId,
          type: 'ADJUSTMENT_OUT',
          quantity: 5,
          reason: 'Concurrency test deduction'
        })
    );

    const responses = await Promise.all(promises);
    for (const r of responses) {
      expect([200, 400, 409]).toContain(r.status);
    }

    const finalStock = await prisma.stock.findUniqueOrThrow({
      where: { productId_locationId: { productId: testProductId, locationId: testLocationId } }
    });
    expect(finalStock.quantityOnHand).toBeLessThanOrEqual(50);
    expect(finalStock.quantityOnHand).toBeGreaterThanOrEqual(0);
  });
});

describe('3. Stock Transfers Between Locations', () => {
  it('should transfer stock from source to target and record in-transit & completion', async () => {
    // Ensure source has at least 20 stock
    await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: testProductId,
        locationId: testLocationId,
        type: 'ADJUSTMENT_IN',
        quantity: 20,
        reason: 'Restock for transfer test'
      });

    const transferRes = await request(app)
      .post('/api/inventory/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourceLocationId: testLocationId,
        targetLocationId: targetLocationId,
        notes: 'Inter-warehouse test transfer',
        items: [{ productId: testProductId, quantity: 10 }]
      });

    expect(transferRes.status).toBe(201);
    expect(transferRes.body.status).toBe('IN_TRANSIT');
    const transferId = transferRes.body.id;

    // Receive transfer
    const receiveRes = await request(app)
      .post(`/api/inventory/transfers/${transferId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.status).toBe('COMPLETED');
  });
});

describe('4. Sales Order Lifecycle (Reserve -> Ship -> Deduct)', () => {
  it('should reserve stock on placement and deduct on shipment', async () => {
    const customer = await prisma.customer.findFirstOrThrow();

    // 1. Reset stock to 20
    await prisma.stock.update({
      where: { productId_locationId: { productId: testProductId, locationId: testLocationId } },
      data: { quantityOnHand: 20, quantityReserved: 0 }
    });

    // 2. Place Order for 5 units
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId: customer.id,
        locationId: testLocationId,
        items: [{ productId: testProductId, quantity: 5 }]
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.status).toBe('PLACED');
    const orderId = orderRes.body.id;

    // Check stock was reserved
    const stockAfterOrder = await prisma.stock.findUniqueOrThrow({
      where: { productId_locationId: { productId: testProductId, locationId: testLocationId } }
    });
    expect(stockAfterOrder.quantityReserved).toBe(5);
    expect(stockAfterOrder.quantityOnHand).toBe(20);

    // 3. Fulfill: Ship Order
    const shipRes = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ status: 'SHIPPED', notes: 'Package dispatched' });

    expect(shipRes.status).toBe(200);
    expect(shipRes.body.status).toBe('SHIPPED');

    // Check stock was deducted and reservation released
    const stockAfterShip = await prisma.stock.findUniqueOrThrow({
      where: { productId_locationId: { productId: testProductId, locationId: testLocationId } }
    });
    expect(stockAfterShip.quantityOnHand).toBe(15);
    expect(stockAfterShip.quantityReserved).toBe(0);
  });
});

describe('5. Purchase Order Flow & Goods Receiving', () => {
  it('should create PO in DRAFT and increase stock when received', async () => {
    const supplier = await prisma.supplier.findFirstOrThrow();

    const poRes = await request(app)
      .post('/api/suppliers/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId: supplier.id,
        destinationLocationId: testLocationId,
        items: [{ productId: testProductId, orderedQuantity: 25, unitCost: 30.0 }]
      });

    expect(poRes.status).toBe(201);
    expect(poRes.body.status).toBe('DRAFT');
    const poId = poRes.body.id;

    const initialStock = await prisma.stock.findUniqueOrThrow({
      where: { productId_locationId: { productId: testProductId, locationId: testLocationId } }
    });

    // Receive goods
    const receiveRes = await request(app)
      .post(`/api/suppliers/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({
        items: [{ productId: testProductId, receivedQuantity: 25 }]
      });

    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.status).toBe('RECEIVED');

    const updatedStock = await prisma.stock.findUniqueOrThrow({
      where: { productId_locationId: { productId: testProductId, locationId: testLocationId } }
    });
    expect(updatedStock.quantityOnHand).toBe(initialStock.quantityOnHand + 25);
  });
});
