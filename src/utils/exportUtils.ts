import type { Customer, Product, PurchaseOrder, SaleInvoice, Supplier } from '../types.ts';
import { getStockStatus, parseCartItemsSummary } from './inventoryLogic.ts';

/**
 * Escapes a single cell value according to RFC 4180 CSV rules.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats an array of headers and 2D array of row values into an RFC 4180 CSV string.
 */
export function formatCsvContent(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Triggers a browser download of a UTF-8 CSV file (with UTF-8 BOM for Excel compatibility).
 */
export function downloadCsvFile(csvContent: string, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const bomContent = csvContent.startsWith('\uFEFF') ? csvContent : `\uFEFF${csvContent}`;
  const blob = new Blob([bomContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * General-purpose Export to CSV utility that formats headers and rows into CSV
 * and triggers a file download in the browser.
 */
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: unknown[][]
): string {
  const csvContent = formatCsvContent(headers, rows);
  downloadCsvFile(csvContent, filename);
  return csvContent;
}

export const PRODUCT_CSV_HEADERS = [
  'SKU',
  'Material Name',
  'Category',
  'Sub-Category / Grade',
  'Unit',
  'Warehouse Location',
  'Supplier Name',
  'Purchase Price (INR)',
  'Selling Price (INR)',
  'Available Quantity',
  'Min Stock Level',
  'Stock Status',
  'Stock Cost Valuation (INR)',
  'Stock Retail Valuation (INR)',
];

export function buildProductCsvRows(products: Product[]): unknown[][] {
  return products.map((p) => {
    const status = getStockStatus(p.quantity, p.minStockLevel);
    const costValuation = Number(
      ((Number(p.quantity) || 0) * (Number(p.purchasePrice) || 0)).toFixed(2)
    );
    const retailValuation = Number(
      ((Number(p.quantity) || 0) * (Number(p.sellingPrice) || 0)).toFixed(2)
    );
    return [
      p.sku,
      p.name,
      p.category,
      p.subCategory || '',
      p.unit,
      p.location,
      p.supplierName,
      Number(p.purchasePrice).toFixed(2),
      Number(p.sellingPrice).toFixed(2),
      p.quantity,
      p.minStockLevel,
      status,
      costValuation.toFixed(2),
      retailValuation.toFixed(2),
    ];
  });
}

/**
 * Generates a formatted CSV string for the Product Catalogue.
 */
export function generateProductsCsv(products: Product[]): string {
  return formatCsvContent(PRODUCT_CSV_HEADERS, buildProductCsvRows(products));
}

/**
 * Formats and downloads the Product Catalogue as a CSV file.
 */
export function exportProductsToCsv(
  products: Product[],
  filename = `buildflow_products_catalogue_${new Date().toISOString().slice(0, 10)}.csv`
): string {
  return exportToCsv(filename, PRODUCT_CSV_HEADERS, buildProductCsvRows(products));
}

export const SALES_HISTORY_CSV_HEADERS = [
  'Invoice Number',
  'Date',
  'Customer Name',
  'Company',
  'Primary Material',
  'Line Items Summary',
  'Total Quantity',
  'Subtotal (INR)',
  'Discount (INR)',
  'Tax Rate (%)',
  'Tax Amount (INR)',
  'Grand Total (INR)',
  'Amount Paid (INR)',
  'Balance Due (INR)',
  'Payment Status',
  'Payment Method',
  'Recorded By',
];

export function buildSalesHistoryCsvRows(sales: SaleInvoice[]): unknown[][] {
  return sales.map((s) => {
    const parsedItems = parseCartItemsSummary(s.itemsSummary, {
      id: s.primaryProductId,
      name: s.primaryProductName,
      totalQuantity: s.totalQuantity,
      subtotal: s.subtotal,
    });
    const readableItems =
      parsedItems.length > 0
        ? parsedItems.map((i) => `${i.productName} (${i.quantity} ${i.unit})`).join('; ')
        : `${s.primaryProductName} (${s.totalQuantity} units)`;

    const amountPaid =
      typeof s.amountPaid === 'number'
        ? s.amountPaid
        : s.paymentStatus === 'Paid'
        ? s.grandTotal
        : 0;
    const balanceDue =
      typeof s.balanceDue === 'number'
        ? s.balanceDue
        : s.paymentStatus === 'Paid'
        ? 0
        : Math.max(0, (Number(s.grandTotal) || 0) - amountPaid);

    return [
      s.invoiceNumber,
      s.createdAt.slice(0, 10),
      s.customerName,
      s.customerCompany,
      s.primaryProductName,
      readableItems,
      s.totalQuantity,
      Number(s.subtotal).toFixed(2),
      Number(s.discountAmount || 0).toFixed(2),
      Number(s.taxRate ?? 18).toFixed(2),
      Number(s.taxAmount || 0).toFixed(2),
      Number(s.grandTotal).toFixed(2),
      Number(amountPaid).toFixed(2),
      Number(balanceDue).toFixed(2),
      s.paymentStatus,
      s.paymentMethod,
      s.createdByName || 'Admin',
    ];
  });
}

/**
 * Generates a formatted CSV string for the Sales History table.
 */
export function generateSalesHistoryCsv(sales: SaleInvoice[]): string {
  return formatCsvContent(SALES_HISTORY_CSV_HEADERS, buildSalesHistoryCsvRows(sales));
}

/**
 * Formats and downloads the Sales History records as a CSV file.
 */
export function exportSalesHistoryToCsv(
  sales: SaleInvoice[],
  filename = `buildflow_sales_history_${new Date().toISOString().slice(0, 10)}.csv`
): string {
  return exportToCsv(filename, SALES_HISTORY_CSV_HEADERS, buildSalesHistoryCsvRows(sales));
}

export function exportSingleInvoiceToCsv(
  invoice: SaleInvoice,
  filename = `invoice_${invoice.invoiceNumber.toLowerCase()}_${invoice.createdAt.slice(0, 10)}.csv`
): string {
  const items =
    invoice.items && invoice.items.length > 0
      ? invoice.items
      : parseCartItemsSummary(invoice.itemsSummary, {
          id: invoice.primaryProductId,
          name: invoice.primaryProductName,
          totalQuantity: invoice.totalQuantity,
          subtotal: invoice.subtotal,
        });

  const headers = [
    'Invoice Number',
    'Issue Date',
    'Customer Company',
    'Customer Contact',
    'Line #',
    'Material Name',
    'SKU',
    'Unit',
    'Quantity',
    'Unit Rate (INR)',
    'Line Total (INR)',
    'Invoice Discount (INR)',
    'Invoice Tax Rate (%)',
    'Invoice Tax Amount (INR)',
    'Invoice Grand Total (INR)',
    'Payment Status',
    'Payment Method',
  ];

  const rows = items.map((item, idx) => [
    invoice.invoiceNumber,
    invoice.createdAt.slice(0, 10),
    invoice.customerCompany,
    invoice.customerName,
    idx + 1,
    item.productName,
    item.sku,
    item.unit,
    item.quantity,
    Number(item.unitPrice).toFixed(2),
    Number(item.lineTotal).toFixed(2),
    idx === 0 ? Number(invoice.discountAmount || 0).toFixed(2) : '',
    idx === 0 ? Number(invoice.taxRate || 0).toFixed(2) : '',
    idx === 0 ? Number(invoice.taxAmount || 0).toFixed(2) : '',
    idx === 0 ? Number(invoice.grandTotal || 0).toFixed(2) : '',
    invoice.paymentStatus,
    invoice.paymentMethod,
  ]);

  return exportToCsv(filename, headers, rows);
}

export const PURCHASE_HISTORY_CSV_HEADERS = [
  'PO Number',
  'Date',
  'Supplier Name',
  'Primary Material',
  'SKU',
  'Quantity Received',
  'Unit Cost (INR)',
  'Subtotal (INR)',
  'Tax Rate (%)',
  'Tax Amount (INR)',
  'Total Amount (INR)',
  'Payment Status',
  'Notes',
];

export function exportPurchasesToCsv(
  purchases: PurchaseOrder[],
  filename = `buildflow_purchases_${new Date().toISOString().slice(0, 10)}.csv`
): string {
  const rows = purchases.map((po) => [
    po.poNumber,
    po.createdAt.slice(0, 10),
    po.supplierName,
    po.productName,
    po.sku,
    po.quantity,
    Number(po.unitPrice || 0).toFixed(2),
    Number(po.subtotal || 0).toFixed(2),
    Number(po.taxRate || 0).toFixed(2),
    Number(po.taxAmount || 0).toFixed(2),
    Number(po.totalAmount || 0).toFixed(2),
    po.paymentStatus,
    po.notes || '',
  ]);
  return exportToCsv(filename, PURCHASE_HISTORY_CSV_HEADERS, rows);
}

export function exportSuppliersToCsv(
  suppliers: Supplier[],
  filename = `buildflow_suppliers_${new Date().toISOString().slice(0, 10)}.csv`
): string {
  const headers = [
    'Code',
    'Supplier Name',
    'Division',
    'Contact Person',
    'Phone',
    'Email',
    'City',
    'GSTIN',
    'Lead Time (Days)',
    'Status',
  ];
  const rows = suppliers.map((s) => [
    s.code,
    s.name,
    s.category,
    s.contactPerson,
    s.phone,
    s.email,
    s.city,
    s.gstin || '',
    s.leadTimeDays,
    s.status,
  ]);
  return exportToCsv(filename, headers, rows);
}

export function exportCustomersToCsv(
  customers: Customer[],
  filename = `buildflow_customers_${new Date().toISOString().slice(0, 10)}.csv`
): string {
  const headers = [
    'Company',
    'Contact Name',
    'Account Tier',
    'Email',
    'Phone',
    'City',
    'GSTIN / Tax ID',
    'Credit Limit (INR)',
    'Outstanding Balance (INR)',
  ];
  const rows = customers.map((c) => [
    c.company,
    c.name,
    c.tier,
    c.email,
    c.phone,
    c.city,
    c.gstOrTaxId,
    Number(c.creditLimit || 0).toFixed(2),
    Number(c.outstandingBalance || 0).toFixed(2),
  ]);
  return exportToCsv(filename, headers, rows);
}


