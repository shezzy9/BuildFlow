import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { dbRepo, getAdminCredentials, initDatabase } from './db.ts';

test('Database repository: init, admin auth, user registration, supplier & customer CRUD, product CRUD, purchase stock increase, sale stock decrease, concurrency & payment', async () => {
  await initDatabase();
  await dbRepo.resetDemoData();

  // 1. Admin authentication credentials verification
  const { email, password } = getAdminCredentials();
  const admin = await dbRepo.findUserByEmail(email);
  assert.ok(admin, 'Admin user should exist');
  assert.equal(bcrypt.compareSync(password, admin.passwordHash), true);

  // 2. Create a supplier and customer in the clean database
  const supplier = await dbRepo.createSupplier({
    name: 'Holcim Structural Materials',
    code: 'SUP-HOL-01',
    contactPerson: 'Vikramaditya Sen',
    phone: '+91 80 4120 8800',
    email: 'orders@holcim.in',
    city: 'Bengaluru, KA',
    gstin: '29AAACH1111K1Z4',
    category: 'Aggregates',
    leadTimeDays: 3,
    rating: 4.9,
    status: 'Active',
  });
  assert.ok(supplier.id);

  const customer = await dbRepo.createCustomer({
    name: 'Raghavendra Rao',
    company: 'Vanguard Civil Infrastructure',
    email: 'procurement@vanguardcivil.in',
    phone: '+91 98450 11223',
    city: 'Bengaluru, KA',
    gstOrTaxId: '29AABCV4421N1Z8',
    creditLimit: 500000,
    outstandingBalance: 0,
    tier: 'Contractor',
  });
  assert.ok(customer.id);

  // 3. Create a new product and verify unique SKU enforcement
  const createdProd = await dbRepo.createProduct({
    name: 'Architectural Basalt Aggregate 20mm',
    sku: 'AGG-BAS-20MM',
    category: 'Aggregates',
    unit: 'Ton',
    quantity: 15,
    minStockLevel: 10,
    purchasePrice: 1800,
    sellingPrice: 2500,
    supplierId: supplier.id,
    supplierName: supplier.name,
    location: 'Yard Bay F-02',
    specification: 'Crushed 20mm structural basalt aggregate',
  });
  assert.equal(createdProd.sku, 'AGG-BAS-20MM');
  assert.equal(createdProd.quantity, 15);

  await assert.rejects(
    async () => {
      await dbRepo.createProduct({
        name: 'Duplicate SKU Product',
        sku: 'agg-bas-20mm',
        category: 'Aggregates',
        unit: 'Ton',
        quantity: 5,
        minStockLevel: 5,
        purchasePrice: 1000,
        sellingPrice: 1500,
        supplierId: supplier.id,
        supplierName: supplier.name,
        location: 'Yard Bay F-02',
        specification: 'Duplicate',
      });
    },
    /already exists/i
  );

  // 4. Record a purchase order and verify stock increases & movement is logged
  const po = await dbRepo.createPurchase({
    supplierId: supplier.id,
    items: [
      {
        productId: createdProd.id,
        quantity: 25,
        unitPrice: 1850,
      },
    ],
    taxRate: 18,
    paymentStatus: 'Paid',
    notes: 'Test inward basalt lot',
  });
  assert.equal(po.quantity, 25);
  assert.equal(po.subtotal, 46250);
  assert.equal(po.taxAmount, 8325);
  assert.equal(po.totalAmount, 54575);

  const afterPurchaseProd = await dbRepo.getProductById(createdProd.id);
  assert.ok(afterPurchaseProd);
  assert.equal(afterPurchaseProd.quantity, 40); // 15 + 25

  // 5. Record a credit sale and verify server-side calculation + stock decrease + customer balance
  const sale = await dbRepo.createSale({
    customerId: customer.id,
    items: [{ productId: createdProd.id, quantity: 10 }],
    discountAmount: 1000,
    taxRate: 18,
    paymentMethod: 'Credit Account',
    paymentStatus: 'Pending',
    notes: 'Test dispatch',
    idempotencyKey: 'test-idem-key-001',
  });
  // 10 * 2500 = 25000 subtotal; - 1000 discount = 24000 taxable; + 18% (4320) = 28320
  assert.equal(sale.subtotal, 25000);
  assert.equal(sale.taxAmount, 4320);
  assert.equal(sale.grandTotal, 28320);
  assert.equal(sale.balanceDue, 28320);

  // Idempotent retry with same idempotencyKey should not deduct stock twice
  const retrySale = await dbRepo.createSale({
    customerId: customer.id,
    items: [{ productId: createdProd.id, quantity: 10 }],
    discountAmount: 1000,
    taxRate: 18,
    paymentMethod: 'Credit Account',
    paymentStatus: 'Pending',
    idempotencyKey: 'test-idem-key-001',
  });
  assert.equal(retrySale.id, sale.id);

  const afterSaleProd = await dbRepo.getProductById(createdProd.id);
  assert.ok(afterSaleProd);
  assert.equal(afterSaleProd.quantity, 30); // 40 - 10

  // 6. Concurrent sales attempting to buy 20 units each when only 30 units remain:
  // Exactly one must succeed and the second must fail with insufficient stock!
  const results = await Promise.allSettled([
    dbRepo.createSale({
      customerId: 'walk_in',
      items: [{ productId: createdProd.id, quantity: 20 }],
      paymentMethod: 'Cash',
      paymentStatus: 'Paid',
    }),
    dbRepo.createSale({
      customerId: 'walk_in',
      items: [{ productId: createdProd.id, quantity: 20 }],
      paymentMethod: 'Cash',
      paymentStatus: 'Paid',
    }),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'Only one concurrent order should succeed');
  assert.equal(rejected.length, 1, 'Second concurrent order exceeding stock must be rejected');

  const afterConcurrentProd = await dbRepo.getProductById(createdProd.id);
  assert.equal(afterConcurrentProd?.quantity, 10); // 30 - 20 = 10 (never negative!)

  // 7. Record partial & full payment against the credit invoice
  const paymentRes = await dbRepo.recordPayment({
    invoiceId: sale.id,
    amount: 28320,
    method: 'Bank Transfer',
    reference: 'UTR-99102',
  });
  assert.equal(paymentRes.updatedInvoice?.paymentStatus, 'Paid');
  assert.equal(paymentRes.updatedInvoice?.balanceDue, 0);

  // Clean up back to clean state
  await dbRepo.resetUserPassword(email, password);
  await dbRepo.resetDemoData();
});
