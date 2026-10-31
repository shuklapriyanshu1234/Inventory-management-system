import bcrypt from 'bcryptjs';
import prisma from '../src/db';
import { runMigrationFromLegacyJson } from '../src/modules/migration/routes';
import path from 'path';

async function main() {
  console.log('--- Starting XYZ Retail Corporation Seeder ---');

  // 1. Create Default Users (Roles: ADMIN, MANAGER, WAREHOUSE_STAFF, SALES)
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Admin123!', salt);

  const users = [
    { email: 'admin@xyzretail.com', name: 'Alice Admin', role: 'ADMIN' },
    { email: 'manager@xyzretail.com', name: 'Bob Manager', role: 'MANAGER' },
    { email: 'warehouse@xyzretail.com', name: 'Charlie Warehouse', role: 'WAREHOUSE_STAFF' },
    { email: 'sales@xyzretail.com', name: 'Diana Sales', role: 'SALES' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, role: u.role, name: u.name, isActive: true },
      create: {
        email: u.email,
        passwordHash,
        name: u.name,
        role: u.role,
        isActive: true
      }
    });
  }
  console.log('✔ Users seeded (Admin, Manager, Warehouse Staff, Sales)');

  // 2. Locations
  const locationsData = [
    { code: 'WH-MAIN', name: 'Main Central Logistics Hub', type: 'WAREHOUSE', address: '100 Distribution Way, Chicago, IL' },
    { code: 'WH-EAST', name: 'East Coast Fulfillment Center', type: 'WAREHOUSE', address: '45 Harbor Blvd, Newark, NJ' },
    { code: 'STR-DOWNTOWN', name: 'Downtown Flagship Store', type: 'STORE', address: '500 Michigan Ave, Chicago, IL' },
    { code: 'STR-SUBURB', name: 'North Suburban Retail Store', type: 'STORE', address: '1200 Lake Cook Rd, Deerfield, IL' },
  ];

  const locations: Record<string, any> = {};
  for (const loc of locationsData) {
    locations[loc.code] = await prisma.location.upsert({
      where: { code: loc.code },
      update: loc,
      create: loc
    });
  }
  console.log('✔ Locations seeded (Warehouses & Stores)');

  // 3. Categories
  const categoriesData = [
    { name: 'Office Supplies', description: 'Desk items, paper, writing tools' },
    { name: 'Electronics', description: 'Gadgets, accessories, computer peripherals' },
    { name: 'Groceries & Snacks', description: 'Packaged foods, beverages, candies' },
  ];

  const categories: Record<string, any> = {};
  for (const cat of categoriesData) {
    categories[cat.name] = await prisma.category.upsert({
      where: { name: cat.name },
      update: cat,
      create: cat
    });
  }
  console.log('✔ Categories seeded');

  // 4. Migrate Prototype Legacy Inventory Items
  const legacyFile = path.resolve(__dirname, '../../legacy_inventory.json');
  try {
    const migrationResult = await runMigrationFromLegacyJson(legacyFile);
    console.log(`✔ Migrated legacy inventory.json (${migrationResult.total} items processed)`);
  } catch (err: any) {
    console.log(`Note on legacy migration: ${err.message}`);
  }

  // 5. Additional Rich Product Catalog Items
  const productsData = [
    { sku: 'SKU-LOGI-MOUSE', barcode: '079357318721', name: 'Logitech Wireless Mouse M185', categoryId: categories['Electronics'].id, price: 14.99, cost: 8.50, reorderLevel: 15, maxLevel: 80 },
    { sku: 'SKU-SAMS-SSD', barcode: '887276310231', name: 'Samsung Portable SSD 1TB T7', categoryId: categories['Electronics'].id, price: 99.99, cost: 65.00, reorderLevel: 8, maxLevel: 50 },
    { sku: 'SKU-POSTIT-PAD', barcode: '051131649980', name: 'Post-it Super Sticky Notes 6-Pack', categoryId: categories['Office Supplies'].id, price: 9.49, cost: 4.20, reorderLevel: 25, maxLevel: 150 },
    { sku: 'SKU-SHARP-PEN', barcode: '071641300010', name: 'Sharpie Fine Point Permanent Marker (Black)', categoryId: categories['Office Supplies'].id, price: 1.89, cost: 0.65, reorderLevel: 30, maxLevel: 200 },
    { sku: 'SKU-KIND-BARS', barcode: '602652171120', name: 'KIND Caramel Almond & Sea Salt Bars (12ct)', categoryId: categories['Groceries & Snacks'].id, price: 17.50, cost: 10.00, reorderLevel: 12, maxLevel: 60 }
  ];

  for (const p of productsData) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: p,
      create: p
    });
  }

  // 6. Seed Multi-Location Stock and Movements
  const allProducts = await prisma.product.findMany();
  for (const prod of allProducts) {
    // Distribute stock in WH-MAIN
    const mainQty = Math.floor(Math.random() * 40) + 20;
    await prisma.stock.upsert({
      where: { productId_locationId: { productId: prod.id, locationId: locations['WH-MAIN'].id } },
      update: { quantityOnHand: mainQty },
      create: { productId: prod.id, locationId: locations['WH-MAIN'].id, quantityOnHand: mainQty, quantityReserved: 0 }
    });

    // Distribute stock in STR-DOWNTOWN
    const storeQty = Math.floor(Math.random() * 15) + 5;
    await prisma.stock.upsert({
      where: { productId_locationId: { productId: prod.id, locationId: locations['STR-DOWNTOWN'].id } },
      update: { quantityOnHand: storeQty },
      create: { productId: prod.id, locationId: locations['STR-DOWNTOWN'].id, quantityOnHand: storeQty, quantityReserved: 0 }
    });
  }
  console.log('✔ Stock levels distributed across warehouses and stores');

  // 7. Seed Suppliers
  const suppliersData = [
    { name: 'Apex Global Logistics & Supplies', contactName: 'Mark Vance', email: 'sales@apexsupplies.com', phone: '312-555-0199', leadTimeDays: 4 },
    { name: 'OmniTech Distribution LLC', contactName: 'Sarah Lin', email: 'orders@omnitech.com', phone: '800-555-9876', leadTimeDays: 3 },
    { name: 'Premier Food & Beverage Wholesale', contactName: 'Carlos Gomez', email: 'carlos@premierwholesale.com', phone: '888-555-3211', leadTimeDays: 5 }
  ];

  const suppliers: Record<string, any> = {};
  for (const s of suppliersData) {
    suppliers[s.name] = await prisma.supplier.upsert({
      where: { name: s.name },
      update: s,
      create: s
    });
  }
  console.log('✔ Suppliers seeded');

  // 8. Seed Customers
  const customersData = [
    { name: 'Acme Corporation', email: 'procurement@acme.com', phone: '312-555-1212', address: '123 Market St, Chicago, IL' },
    { name: 'Beacon Creative Studio', email: 'ops@beaconstudio.io', phone: '630-555-4545', address: '400 W Ontario St, Chicago, IL' },
    { name: 'TechForward Labs', email: 'orders@techforward.org', phone: '847-555-7890', address: '800 Innovation Way, Evanston, IL' }
  ];

  const customers: Record<string, any> = {};
  for (const c of customersData) {
    customers[c.name] = await prisma.customer.upsert({
      where: { email: c.email },
      update: c,
      create: c
    });
  }
  console.log('✔ Customers seeded');

  // 9. Seed Sample Purchase Order
  const poNumber = 'PO-INIT-1001';
  const existingPo = await prisma.purchaseOrder.findUnique({ where: { poNumber } });
  if (!existingPo) {
    const sampleProduct = allProducts[0];
    await prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: suppliers['Apex Global Logistics & Supplies'].id,
        destinationLocationId: locations['WH-MAIN'].id,
        status: 'RECEIVED',
        totalAmount: sampleProduct.cost * 50,
        expectedDate: new Date(Date.now() - 86400000 * 2),
        receivedDate: new Date(Date.now() - 86400000 * 2),
        items: {
          create: [{
            productId: sampleProduct.id,
            orderedQuantity: 50,
            receivedQuantity: 50,
            unitCost: sampleProduct.cost
          }]
        }
      }
    });
  }

  // 10. Seed Sample Sales Order
  const orderNumber = 'SO-INIT-2001';
  const existingOrder = await prisma.salesOrder.findUnique({ where: { orderNumber } });
  if (!existingOrder) {
    const sampleProduct = allProducts[0];
    await prisma.salesOrder.create({
      data: {
        orderNumber,
        customerId: customers['Acme Corporation'].id,
        locationId: locations['WH-MAIN'].id,
        status: 'DELIVERED',
        totalAmount: sampleProduct.price * 5,
        items: {
          create: [{
            productId: sampleProduct.id,
            quantity: 5,
            unitPrice: sampleProduct.price,
            backorderedQuantity: 0
          }]
        },
        timeline: {
          create: [
            { status: 'PLACED', notes: 'Order placed by customer' },
            { status: 'SHIPPED', notes: 'Dispatched via Express Courier' },
            { status: 'DELIVERED', notes: 'Delivered and signed at reception' }
          ]
        }
      }
    });
  }
  console.log('✔ Initial Purchase and Sales Orders seeded');

  // 11. Seed Api Key
  await prisma.apiKey.upsert({
    where: { key: 'xyz_live_demokey_8899aabbccddeeff0011' },
    update: {},
    create: {
      key: 'xyz_live_demokey_8899aabbccddeeff0011',
      name: 'Default ERP Integration Key',
      role: 'ADMIN'
    }
  });

  console.log('--- XYZ Retail Corporation Seeding Complete ---');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
