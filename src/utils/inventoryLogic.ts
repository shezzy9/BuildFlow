import type {
  DatePeriodFilter,
  Product,
  PurchaseItem,
  PurchaseOrder,
  SaleCartItem,
  SaleInvoice,
  StockMovement,
  StockStatus,
} from '../types.ts';

export const BLUEPRINT_LIMITS = {
  ID_MAX: 128,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  NAME_MAX: 120,
  SKU_MAX: 40,
  UNIT_MAX: 40,
  LOCATION_MAX: 80,
  SPEC_MAX: 240,
  NOTES_MAX: 400,
  ITEMS_SUMMARY_MAX: 1800,
};

export function sanitizeString(val: string, maxLength: number): string {
  return String(val ?? '').trim().slice(0, maxLength);
}

export function isValidEntityId(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= BLUEPRINT_LIMITS.ID_MAX &&
    BLUEPRINT_LIMITS.ID_PATTERN.test(id)
  );
}

export function formatCurrency(amount: number, currencySymbol = '₹', decimals = 2): string {
  const safeNum = Number.isFinite(amount) ? amount : 0;
  const isINR = currencySymbol === '₹' || currencySymbol.toUpperCase() === 'INR';
  const locale = isINR ? 'en-IN' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safeNum);
  return `${currencySymbol}${formatted}`;
}

export function formatNumberIN(amount: number, decimals = 0): string {
  const safeNum = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safeNum);
}

export function getStockStatus(quantity: number, minStockLevel: number): StockStatus {
  if (quantity <= 0) return 'Out of Stock';
  if (quantity <= minStockLevel) return 'Low Stock';
  return 'In Stock';
}

export type LowStockSeverity = 'critical' | 'warning';

export interface LowStockAlertItem {
  product: Product;
  status: StockStatus;
  severity: LowStockSeverity;
  effectiveThreshold: number;
  deficit: number;
  recommendedOrderQty: number;
  estimatedRestockCost: number;
  stockCoveragePercent: number;
}

export interface LowStockAlertSummary {
  alerts: LowStockAlertItem[];
  totalAlertsCount: number;
  criticalCount: number;
  warningCount: number;
  outOfStockCount: number;
  totalDeficitUnits: number;
  totalEstimatedRestockCost: number;
}

export function evaluateLowStockAlerts(
  products: Product[],
  globalFallbackThreshold = 0
): LowStockAlertSummary {
  const alerts: LowStockAlertItem[] = [];

  for (const product of products) {
    const rawMin = Number(product.minStockLevel);
    const effectiveThreshold =
      Number.isFinite(rawMin) && rawMin > 0
        ? rawMin
        : Math.max(0, Number(globalFallbackThreshold) || 0);
    const qty = Number(product.quantity) || 0;

    if (qty <= effectiveThreshold) {
      const status = getStockStatus(qty, effectiveThreshold);
      const isCritical = qty <= 0 || (effectiveThreshold > 0 && qty <= effectiveThreshold * 0.25);
      const severity: LowStockSeverity = isCritical ? 'critical' : 'warning';
      const deficit = Math.max(0, Number((effectiveThreshold - qty).toFixed(2)));
      const targetRestockLevel = Math.max(effectiveThreshold * 2, effectiveThreshold + 10, 10);
      const recommendedOrderQty = Math.max(
        1,
        Math.ceil(targetRestockLevel - Math.max(0, qty))
      );
      const estimatedRestockCost = Number(
        (recommendedOrderQty * (Number(product.purchasePrice) || 0)).toFixed(2)
      );
      const stockCoveragePercent =
        effectiveThreshold > 0
          ? Math.min(100, Math.max(0, Math.round((Math.max(0, qty) / effectiveThreshold) * 100)))
          : qty <= 0
          ? 0
          : 100;

      alerts.push({
        product,
        status,
        severity,
        effectiveThreshold,
        deficit,
        recommendedOrderQty,
        estimatedRestockCost,
        stockCoveragePercent,
      });
    }
  }

  alerts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    if (a.stockCoveragePercent !== b.stockCoveragePercent) {
      return a.stockCoveragePercent - b.stockCoveragePercent;
    }
    return b.deficit - a.deficit;
  });

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;
  const outOfStockCount = alerts.filter((a) => a.product.quantity <= 0).length;
  const totalDeficitUnits = Number(
    alerts.reduce((sum, a) => sum + a.deficit, 0).toFixed(2)
  );
  const totalEstimatedRestockCost = Number(
    alerts.reduce((sum, a) => sum + a.estimatedRestockCost, 0).toFixed(2)
  );

  return {
    alerts,
    totalAlertsCount: alerts.length,
    criticalCount,
    warningCount,
    outOfStockCount,
    totalDeficitUnits,
    totalEstimatedRestockCost,
  };
}

export interface CartTotals {
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
}

export function calculateSaleTotals(
  items: SaleCartItem[],
  discountInput: number,
  taxRatePercent: number
): CartTotals {
  const itemCount = items.length;
  const totalQuantity = items.reduce((acc, item) => acc + Math.max(0, item.quantity), 0);
  const rawSubtotal = items.reduce(
    (acc, item) => acc + Math.max(0, item.quantity) * Math.max(0, item.unitPrice),
    0
  );
  const subtotal = Number(rawSubtotal.toFixed(2));
  const clampedDiscount = Math.min(Math.max(0, discountInput || 0), subtotal);
  const discountAmount = Number(clampedDiscount.toFixed(2));
  const taxableAmount = Number(Math.max(0, subtotal - discountAmount).toFixed(2));
  const safeTaxRate = Math.min(Math.max(0, taxRatePercent ?? 0), 100);
  const taxAmount = Number(((taxableAmount * safeTaxRate) / 100).toFixed(2));
  const grandTotal = Number((taxableAmount + taxAmount).toFixed(2));

  return {
    itemCount,
    totalQuantity,
    subtotal,
    discountAmount,
    taxableAmount,
    taxRate: safeTaxRate,
    taxAmount,
    grandTotal,
  };
}

export const calculateInvoiceTotals = calculateSaleTotals;


export function calculatePurchaseTotals(
  items: PurchaseItem[],
  taxRatePercent: number
): {
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
} {
  const itemCount = items.length;
  const totalQuantity = items.reduce((acc, i) => acc + Math.max(0, i.quantity), 0);
  const subtotal = Number(
    items
      .reduce((acc, i) => acc + Math.max(0, i.quantity) * Math.max(0, i.unitPrice), 0)
      .toFixed(2)
  );
  const safeTaxRate = Math.min(Math.max(0, taxRatePercent ?? 0), 100);
  const taxAmount = Number(((subtotal * safeTaxRate) / 100).toFixed(2));
  const totalAmount = Number((subtotal + taxAmount).toFixed(2));
  return {
    itemCount,
    totalQuantity,
    subtotal,
    taxRate: safeTaxRate,
    taxAmount,
    totalAmount,
  };
}

export interface StockValidationResult {
  valid: boolean;
  error?: string;
}

export function validateSaleStock(
  items: SaleCartItem[],
  products: Product[]
): StockValidationResult {
  if (!items || items.length === 0) {
    return { valid: false, error: 'Please add at least one building material to the bill.' };
  }

  for (const item of items) {
    if (item.quantity <= 0 || !Number.isFinite(item.quantity)) {
      return {
        valid: false,
        error: `Quantity for "${item.productName}" must be greater than zero.`,
      };
    }
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      return {
        valid: false,
        error: `Material "${item.productName}" no longer exists in catalogue.`,
      };
    }
    if (item.quantity > product.quantity) {
      return {
        valid: false,
        error: `Insufficient stock for "${product.name}". Available: ${product.quantity} ${product.unit}, requested: ${item.quantity}.`,
      };
    }
  }

  return { valid: true };
}

export function applyPurchaseToInventory(
  product: Product,
  purchaseQuantity: number,
  newPurchasePrice?: number,
  timestampIso = new Date().toISOString()
): { updatedProduct: Product; previousStock: number; newStock: number } {
  if (purchaseQuantity <= 0 || !Number.isFinite(purchaseQuantity)) {
    throw new Error('Purchase quantity must be greater than zero.');
  }
  const previousStock = product.quantity;
  const newStock = Number((previousStock + purchaseQuantity).toFixed(2));
  const updatedProduct: Product = {
    ...product,
    quantity: newStock,
    purchasePrice:
      typeof newPurchasePrice === 'number' && newPurchasePrice > 0
        ? Number(newPurchasePrice.toFixed(2))
        : product.purchasePrice,
    updatedAt: timestampIso,
  };
  return { updatedProduct, previousStock, newStock };
}

export function applySaleToInventory(
  products: Product[],
  cartItems: SaleCartItem[],
  invoiceNumber: string,
  ownerId: string,
  timestampIso = new Date().toISOString()
): {
  updatedProducts: Product[];
  movements: StockMovement[];
} {
  const check = validateSaleStock(cartItems, products);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const movements: StockMovement[] = [];
  const updatedProducts = products.map((product) => {
    const soldItem = cartItems.find((c) => c.productId === product.id);
    if (!soldItem) return product;

    const previousStock = product.quantity;
    const newStock = Number(Math.max(0, previousStock - soldItem.quantity).toFixed(2));

    movements.push({
      id: `mov_${Date.now()}_${product.id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      type: 'OUT_SALE',
      quantityDelta: -soldItem.quantity,
      previousStock,
      newStock,
      referenceNumber: invoiceNumber,
      reason: `Dispatched on Invoice ${invoiceNumber}`,
      ownerId,
      createdAt: timestampIso,
    });

    return {
      ...product,
      quantity: newStock,
      updatedAt: timestampIso,
    };
  });

  return { updatedProducts, movements };
}

export function serializeCartItemsSummary(items: SaleCartItem[]): string {
  const raw = JSON.stringify(
    items.map((item) => ({
      productId: item.productId,
      productName: sanitizeString(item.productName, 60),
      sku: sanitizeString(item.sku, 24),
      category: item.category,
      unit: sanitizeString(item.unit, 20),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: Number((item.quantity * item.unitPrice).toFixed(2)),
    }))
  );
  return raw.slice(0, BLUEPRINT_LIMITS.ITEMS_SUMMARY_MAX);
}

export function parseCartItemsSummary(
  summary: string,
  fallbackProduct?: { id: string; name: string; totalQuantity: number; subtotal: number }
): SaleCartItem[] {
  try {
    const parsed = JSON.parse(summary);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item) => ({
        productId: String(item.productId || 'prod_1'),
        productName: String(item.productName || 'Material Item'),
        sku: String(item.sku || 'MAT-001'),
        category: item.category || 'Cement',
        unit: String(item.unit || 'Unit'),
        quantity: Number(item.quantity || 1),
        availableStock: Number(item.availableStock || 100),
        unitPrice: Number(item.unitPrice || 0),
        lineTotal: Number(item.lineTotal || 0),
      }));
    }
  } catch {
    // Fallback if plain string summary
  }
  if (fallbackProduct) {
    const qty = Math.max(1, fallbackProduct.totalQuantity);
    const unitPrice = Number((fallbackProduct.subtotal / qty).toFixed(2));
    return [
      {
        productId: fallbackProduct.id,
        productName: fallbackProduct.name,
        sku: 'SKU-STD',
        category: 'Cement',
        unit: 'Unit',
        quantity: qty,
        availableStock: 100,
        unitPrice,
        lineTotal: fallbackProduct.subtotal,
      },
    ];
  }
  return [];
}

export function filterRecordsByPeriod<T extends { createdAt: string }>(
  records: T[],
  period: DatePeriodFilter,
  referenceDate: Date = new Date('2026-10-29T23:59:59.999Z')
): T[] {
  if (period === 'all') return records;
  const refMs = referenceDate.getTime();
  const cutoffMs =
    period === 'today'
      ? new Date(referenceDate.toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime()
      : period === '7d'
      ? refMs - 7 * 24 * 60 * 60 * 1000
      : refMs - 30 * 24 * 60 * 60 * 1000;

  return records.filter((r) => {
    const t = new Date(r.createdAt).getTime();
    return Number.isFinite(t) && t >= cutoffMs;
  });
}

export interface DashboardMetricsSummary {
  totalSalesRevenue: number;
  totalPurchasesSpend: number;
  totalProductsCount: number;
  totalUnitsInStock: number;
  lowStockProductsCount: number;
  outOfStockCount: number;
  inventoryValuation: number;
  inventoryRetailValue: number;
  outstandingReceivables: number;
  outstandingPayables: number;
}

export function computeDashboardMetrics(
  products: Product[],
  sales: SaleInvoice[],
  purchases: PurchaseOrder[],
  period: DatePeriodFilter = 'all'
): DashboardMetricsSummary {
  const scopedSales = period === 'all' ? sales : filterRecordsByPeriod(sales, period);
  const scopedPurchases = period === 'all' ? purchases : filterRecordsByPeriod(purchases, period);

  const totalSalesRevenue = Number(
    scopedSales.reduce((sum, s) => sum + (Number(s.grandTotal) || 0), 0).toFixed(2)
  );
  const totalPurchasesSpend = Number(
    scopedPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0).toFixed(2)
  );
  const totalProductsCount = products.length;
  const totalUnitsInStock = Number(
    products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0).toFixed(2)
  );
  const lowStockProductsCount = products.filter(
    (p) => p.quantity <= p.minStockLevel
  ).length;
  const outOfStockCount = products.filter((p) => p.quantity <= 0).length;
  const inventoryValuation = Number(
    products
      .reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.purchasePrice) || 0), 0)
      .toFixed(2)
  );
  const inventoryRetailValue = Number(
    products
      .reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.sellingPrice) || 0), 0)
      .toFixed(2)
  );

  const outstandingReceivables = Number(
    sales
      .reduce((sum, s) => {
        if (typeof s.balanceDue === 'number') return sum + s.balanceDue;
        if (s.paymentStatus === 'Paid') return sum;
        const paid = typeof s.amountPaid === 'number' ? s.amountPaid : 0;
        return sum + Math.max(0, (Number(s.grandTotal) || 0) - paid);
      }, 0)
      .toFixed(2)
  );

  const outstandingPayables = Number(
    purchases
      .reduce((sum, p) => {
        if (typeof p.balanceDue === 'number') return sum + p.balanceDue;
        if (p.paymentStatus === 'Paid') return sum;
        const paid = typeof p.amountPaid === 'number' ? p.amountPaid : 0;
        return sum + Math.max(0, (Number(p.totalAmount) || 0) - paid);
      }, 0)
      .toFixed(2)
  );

  return {
    totalSalesRevenue,
    totalPurchasesSpend,
    totalProductsCount,
    totalUnitsInStock,
    lowStockProductsCount,
    outOfStockCount,
    inventoryValuation,
    inventoryRetailValue,
    outstandingReceivables,
    outstandingPayables,
  };
}

export {
  escapeCsvCell,
  formatCsvContent,
  downloadCsvFile,
  exportToCsv,
  generateProductsCsv,
  exportProductsToCsv,
  generateSalesHistoryCsv,
  exportSalesHistoryToCsv,
} from './exportUtils.ts';


