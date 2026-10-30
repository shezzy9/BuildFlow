import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeCsvCell,
  formatCsvContent,
  exportToCsv,
  generateProductsCsv,
  exportProductsToCsv,
  generateSalesHistoryCsv,
  exportSalesHistoryToCsv,
  exportSingleInvoiceToCsv,
} from './exportUtils.ts';
import {
  numberToIndianWords,
  buildPrintableInvoiceHtml,
  buildPrintablePurchaseOrderHtml,
} from './printUtils.ts';
import type { BusinessSettings, Product, PurchaseOrder, SaleInvoice } from '../types.ts';

describe('exportUtils & printUtils Utilities', () => {
  it('escapes commas, double quotes, and newlines according to RFC 4180', () => {
    assert.equal(escapeCsvCell('OPC 53 Cement'), 'OPC 53 Cement');
    assert.equal(escapeCsvCell('Pipe, 110mm "Heavy"'), '"Pipe, 110mm ""Heavy"""');
    assert.equal(escapeCsvCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
    assert.equal(escapeCsvCell(null), '');
    assert.equal(escapeCsvCell(undefined), '');
  });

  it('formats generic headers and rows via formatCsvContent and exportToCsv', () => {
    const headers = ['SKU', 'Name', 'Qty'];
    const rows = [
      ['CEM-01', 'Portland Cement, 50kg', 320],
      ['STL-02', 'TMT Rebar "Fe-550D"', 85],
    ];
    const csv = exportToCsv('test_export.csv', headers, rows);
    assert.equal(csv, formatCsvContent(headers, rows));
    const lines = csv.split('\r\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], 'SKU,Name,Qty');
    assert.equal(lines[1], 'CEM-01,"Portland Cement, 50kg",320');
    assert.equal(lines[2], 'STL-02,"TMT Rebar ""Fe-550D""",85');
  });

  it('generates formatted CSV for Product Catalogue records', () => {
    const sampleProducts: Product[] = [
      {
        id: 'prod_1',
        name: 'Structural OPC 53 Cement, Grade A',
        sku: 'CEM-OPC53-50',
        category: 'Cement',
        subCategory: 'OPC 53 Grade',
        unit: '50 kg Bag',
        purchasePrice: 340,
        sellingPrice: 410,
        quantity: 200,
        minStockLevel: 80,
        location: 'Bay A-01, Silo Pallet',
        supplierId: 'sup_1',
        supplierName: 'Vindhya Cement Works',
        specification: 'IS 12269 Certified',
        ownerId: 'admin',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-29T10:00:00.000Z',
      },
    ];

    const csv = generateProductsCsv(sampleProducts);
    assert.equal(csv, exportProductsToCsv(sampleProducts));
    const lines = csv.split('\r\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes('SKU,Material Name,Category'));
    assert.ok(lines[1].includes('"Structural OPC 53 Cement, Grade A"'));
    assert.ok(lines[1].includes('82000.00'));
  });

  it('generates formatted CSV and printable A4/Thermal HTML for Sales Invoices & Purchase Orders', () => {
    const sampleSales: SaleInvoice[] = [
      {
        id: 'sale_1',
        invoiceNumber: 'INV-2026-1099',
        customerId: 'cust_1',
        customerName: 'Raghavendra Rao',
        customerCompany: 'Studio Tecton, Architects',
        primaryProductId: 'prod_1',
        primaryProductName: 'Structural OPC 53 Cement',
        itemsSummary: JSON.stringify([
          {
            productId: 'prod_1',
            productName: 'Structural OPC 53 Cement',
            sku: 'CEM-OPC53-50',
            category: 'Cement',
            unit: '50 kg Bag',
            quantity: 50,
            unitPrice: 410,
            lineTotal: 20500,
          },
        ]),
        itemCount: 1,
        totalQuantity: 50,
        subtotal: 20500,
        discountAmount: 500,
        taxRate: 18,
        taxAmount: 3600,
        grandTotal: 23600,
        amountPaid: 20000,
        balanceDue: 3600,
        paymentStatus: 'Partial',
        paymentMethod: 'Bank Transfer',
        status: 'completed',
        notes: 'Site delivery',
        createdByName: 'Arjun Mehta',
        ownerId: 'admin',
        createdAt: '2026-10-29T10:30:00.000Z',
        updatedAt: '2026-10-29T10:30:00.000Z',
      },
    ];

    const csv = generateSalesHistoryCsv(sampleSales);
    assert.equal(csv, exportSalesHistoryToCsv(sampleSales));
    const singleCsv = exportSingleInvoiceToCsv(sampleSales[0]);
    assert.ok(singleCsv.includes('Invoice Grand Total (INR)'));
    assert.ok(singleCsv.includes('23600.00'));

    const words = numberToIndianWords(23600, '₹');
    assert.equal(words, 'Rupees Twenty-Three Thousand Six Hundred Only');

    const sampleSettings: BusinessSettings = {
      id: 'settings_1',
      businessName: 'BuildFlow Supply',
      legalName: 'BuildFlow Architectural Materials Pvt. Ltd.',
      taxRegistrationNumber: '29AABCB4821N1Z4',
      currencySymbol: '₹',
      currencyCode: 'INR',
      defaultTaxRate: 18,
      invoicePrefix: 'INV-2026-',
      warehouseAddress: 'Plot 14, Peenya Industrial Area, Bengaluru 560058',
      contactEmail: 'dispatch@buildflowsupply.in',
      contactPhone: '+91 80 4192 6600',
      lowStockGlobalThreshold: 30,
      ownerId: 'admin',
      updatedAt: '2026-10-29T10:30:00.000Z',
    };

    const htmlA4 = buildPrintableInvoiceHtml(sampleSales[0], sampleSettings, null, {
      copyType: 'ORIGINAL FOR RECIPIENT',
      paperFormat: 'a4',
      taxSplitMode: 'cgst_sgst',
    });
    assert.ok(htmlA4.includes('INV-2026-1099'));
    assert.ok(htmlA4.includes('ORIGINAL FOR RECIPIENT'));
    assert.ok(htmlA4.includes('CGST (9%)'));
    assert.ok(htmlA4.includes('SGST (9%)'));
    assert.ok(htmlA4.includes('Twenty-Three Thousand Six Hundred Only'));

    const htmlThermal = buildPrintableInvoiceHtml(sampleSales[0], sampleSettings, null, {
      paperFormat: 'thermal80',
    });
    assert.ok(htmlThermal.includes('80mm'));
    assert.ok(htmlThermal.includes('INV-2026-1099'));

    const samplePo: PurchaseOrder = {
      id: 'po_1',
      purchaseNumber: 'PO-2026-8801',
      poNumber: 'PO-2026-8801',
      supplierId: 'sup_1',
      supplierName: 'Vindhya Cement Works',
      productId: 'prod_1',
      productName: 'Structural OPC 53 Cement',
      sku: 'CEM-OPC53-50',
      quantity: 100,
      unitPrice: 340,
      subtotal: 34000,
      taxRate: 18,
      taxAmount: 6120,
      totalCost: 40120,
      totalAmount: 40120,
      paymentStatus: 'Paid',
      status: 'received',
      notes: 'Delivered to main yard',
      date: '2026-10-29',
      ownerId: 'admin',
      createdAt: '2026-10-29T10:30:00.000Z',
      updatedAt: '2026-10-29T10:30:00.000Z',
    };
    const poHtml = buildPrintablePurchaseOrderHtml(samplePo, sampleSettings, null);
    assert.ok(poHtml.includes('PO-2026-8801'));
    assert.ok(poHtml.includes('Vindhya Cement Works'));
  });
});

