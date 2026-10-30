import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPurchaseToInventory,
  applySaleToInventory,
  calculatePurchaseTotals,
  calculateSaleTotals,
  computeDashboardMetrics,
  escapeCsvCell,
  evaluateLowStockAlerts,
  filterRecordsByPeriod,
  formatCurrency,
  generateProductsCsv,
  generateSalesHistoryCsv,
  getStockStatus,
  isValidEntityId,
  parseCartItemsSummary,
  sanitizeString,
  serializeCartItemsSummary,
  validateSaleStock,
} from './inventoryLogic';
import { INITIAL_PRODUCTS, INITIAL_PURCHASES, INITIAL_SALES } from '../data/seedData';

test('getStockStatus accurately classifies In Stock, Low Stock, and Out of Stock', () => {
  assert.equal(getStockStatus(120, 30), 'In Stock');
  assert.equal(getStockStatus(30, 30), 'Low Stock');
  assert.equal(getStockStatus(10, 30), 'Low Stock');
  assert.equal(getStockStatus(0, 30), 'Out of Stock');
});

test('formatCurrency formats Indian Rupees with en-IN grouping', () => {
  const formatted = formatCurrency(142500, '₹');
  assert.equal(formatted, '₹1,42,500.00');
});

test('calculateSaleTotals computes subtotal, discount clamp, tax, and grand total', () => {
  const items = [
    {
      productId: 'prod_1',
      productName: 'Portland Cement',
      sku: 'CEM-01',
      category: 'Cement' as const,
      unit: 'Bag',
      quantity: 10,
      availableStock: 100,
      unitPrice: 400,
      lineTotal: 4000,
    },
  ];
  const res = calculateSaleTotals(items, 200, 18);
  assert.equal(res.subtotal, 4000);
  assert.equal(res.discountAmount, 200);
  assert.equal(res.taxableAmount, 3800);
  assert.equal(res.taxAmount, 684);
  assert.equal(res.grandTotal, 4484);
});

test('calculatePurchaseTotals aggregates multiple line items and configurable tax', () => {
  const res = calculatePurchaseTotals(
    [
      {
        productId: 'p1',
        productName: 'Cement',
        sku: 'CEM-1',
        unit: 'Bag',
        quantity: 50,
        unitPrice: 300,
        lineTotal: 15000,
      },
      {
        productId: 'p2',
        productName: 'Steel',
        sku: 'STL-1',
        unit: 'Ton',
        quantity: 2,
        unitPrice: 50000,
        lineTotal: 100000,
      },
    ],
    18
  );
  assert.equal(res.itemCount, 2);
  assert.equal(res.totalQuantity, 52);
  assert.equal(res.subtotal, 115000);
  assert.equal(res.taxAmount, 20700);
  assert.equal(res.totalAmount, 135700);
});

test('validateSaleStock prevents selling more than available inventory', () => {
  const checkOk = validateSaleStock(
    [
      {
        productId: 'prod_cement_525',
        productName: 'Architectural Portland Cement CEM I 52.5N',
        sku: 'CEM-525-50KG',
        category: 'Cement',
        unit: 'Bag (50kg)',
        quantity: 50,
        availableStock: 420,
        unitPrice: 420,
        lineTotal: 21000,
      },
    ],
    INITIAL_PRODUCTS
  );
  assert.equal(checkOk.valid, true);

  const checkFail = validateSaleStock(
    [
      {
        productId: 'prod_cement_525',
        productName: 'Architectural Portland Cement CEM I 52.5N',
        sku: 'CEM-525-50KG',
        category: 'Cement',
        unit: 'Bag (50kg)',
        quantity: 9999,
        availableStock: 420,
        unitPrice: 420,
        lineTotal: 4199580,
      },
    ],
    INITIAL_PRODUCTS
  );
  assert.equal(checkFail.valid, false);
  assert.match(checkFail.error || '', /Insufficient stock/);
});

test('applyPurchaseToInventory increases stock and updates purchase price', () => {
  const base = INITIAL_PRODUCTS[0];
  const res = applyPurchaseToInventory(base, 80, 350, '2026-10-29T10:00:00.000Z');
  assert.equal(res.previousStock, base.quantity);
  assert.equal(res.newStock, base.quantity + 80);
  assert.equal(res.updatedProduct.purchasePrice, 350);
});

test('applySaleToInventory deducts stock and records OUT_SALE movement', () => {
  const res = applySaleToInventory(
    INITIAL_PRODUCTS,
    [
      {
        productId: 'prod_cement_525',
        productName: 'Architectural Portland Cement CEM I 52.5N',
        sku: 'CEM-525-50KG',
        category: 'Cement',
        unit: 'Bag (50kg)',
        quantity: 20,
        availableStock: 420,
        unitPrice: 420,
        lineTotal: 8400,
      },
    ],
    'BFS-2026-1099',
    'usr_admin_01',
    '2026-10-29T10:00:00.000Z'
  );
  const updatedCement = res.updatedProducts.find((p) => p.id === 'prod_cement_525')!;
  assert.equal(updatedCement.quantity, INITIAL_PRODUCTS[0].quantity - 20);
  assert.equal(res.movements.length, 1);
  assert.equal(res.movements[0].quantityDelta, -20);
  assert.equal(res.movements[0].type, 'OUT_SALE');
});

test('serializeCartItemsSummary and parseCartItemsSummary round-trip cleanly within blueprint limits', () => {
  const items = [
    {
      productId: 'prod_1',
      productName: 'Ribbed Steel',
      sku: 'STL-16',
      category: 'Steel' as const,
      unit: 'Ton',
      quantity: 4,
      availableStock: 20,
      unitPrice: 58000,
      lineTotal: 232000,
    },
  ];
  const serialized = serializeCartItemsSummary(items);
  const parsed = parseCartItemsSummary(serialized);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].sku, 'STL-16');
  assert.equal(parsed[0].lineTotal, 232000);
});

test('computeDashboardMetrics aggregates revenue, spend, receivables, and low stock counts', () => {
  const summary = computeDashboardMetrics(INITIAL_PRODUCTS, INITIAL_SALES, INITIAL_PURCHASES);
  assert.equal(summary.totalProductsCount, INITIAL_PRODUCTS.length);
  assert.ok(summary.totalSalesRevenue > 0);
  assert.ok(summary.totalPurchasesSpend > 0);
  assert.ok(summary.outstandingReceivables >= 0);
  assert.equal(summary.lowStockProductsCount, 3);
});

test('filterRecordsByPeriod filters records accurately by date window', () => {
  const records = [
    { id: '1', createdAt: '2026-10-29T10:00:00.000Z' },
    { id: '2', createdAt: '2026-10-25T10:00:00.000Z' },
    { id: '3', createdAt: '2026-09-01T10:00:00.000Z' },
  ];
  const refDate = new Date('2026-10-29T15:00:00.000Z');
  assert.equal(filterRecordsByPeriod(records, 'today', refDate).length, 1);
  assert.equal(filterRecordsByPeriod(records, '7d', refDate).length, 2);
  assert.equal(filterRecordsByPeriod(records, 'all', refDate).length, 3);
});

test('isValidEntityId and sanitizeString enforce blueprint limits', () => {
  assert.equal(isValidEntityId('prod_cement_525'), true);
  assert.equal(isValidEntityId('bad id with spaces!'), false);
  assert.equal(sanitizeString('  Hello World  ', 5), 'Hello');
});

test('escapeCsvCell, generateProductsCsv, and generateSalesHistoryCsv produce RFC-4180 compliant CSV output', () => {
  assert.equal(escapeCsvCell('Simple'), 'Simple');
  assert.equal(escapeCsvCell('Has, comma'), '"Has, comma"');
  assert.equal(escapeCsvCell('Has "quotes" inside'), '"Has ""quotes"" inside"');

  const productsCsv = generateProductsCsv(INITIAL_PRODUCTS.slice(0, 2));
  const productLines = productsCsv.split('\r\n');
  assert.equal(productLines.length, 3);
  assert.match(productLines[0], /^SKU,Material Name,Category/);
  assert.match(productLines[1], /CEM-525-50KG/);

  const salesCsv = generateSalesHistoryCsv(INITIAL_SALES.slice(0, 2));
  const salesLines = salesCsv.split('\r\n');
  assert.equal(salesLines.length, 3);
  assert.match(salesLines[0], /^Invoice Number,Date,Customer Name,Company/);
  assert.match(salesLines[1], /BFS-2026-1041/);
});

test('evaluateLowStockAlerts flags products at or below threshold, classifies critical vs warning, and computes deficits', () => {
  const sampleProducts = [
    {
      ...INITIAL_PRODUCTS[0],
      id: 'p_healthy',
      name: 'Healthy Cement',
      quantity: 200,
      minStockLevel: 50,
      purchasePrice: 350,
    },
    {
      ...INITIAL_PRODUCTS[0],
      id: 'p_warning',
      name: 'Low Timber Joist',
      quantity: 20,
      minStockLevel: 40,
      purchasePrice: 1200,
    },
    {
      ...INITIAL_PRODUCTS[0],
      id: 'p_critical',
      name: 'Out of Stock Rebar',
      quantity: 0,
      minStockLevel: 15,
      purchasePrice: 55000,
    },
  ];

  const summary = evaluateLowStockAlerts(sampleProducts, 30);
  assert.equal(summary.totalAlertsCount, 2);
  assert.equal(summary.criticalCount, 1);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.outOfStockCount, 1);
  // Critical alert should be sorted first
  assert.equal(summary.alerts[0].product.id, 'p_critical');
  assert.equal(summary.alerts[0].severity, 'critical');
  assert.equal(summary.alerts[0].deficit, 15);
  assert.equal(summary.alerts[0].recommendedOrderQty, 30);
  // Warning alert second
  assert.equal(summary.alerts[1].product.id, 'p_warning');
  assert.equal(summary.alerts[1].severity, 'warning');
  assert.equal(summary.alerts[1].deficit, 20);
  assert.equal(summary.alerts[1].stockCoveragePercent, 50);
});


