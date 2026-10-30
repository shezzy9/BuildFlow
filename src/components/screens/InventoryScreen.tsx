import React, { useState, useMemo, useEffect } from 'react';
import {
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Search,
  AlertTriangle,
  Download,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  getStockStatus,
  computeDashboardMetrics,
  evaluateLowStockAlerts,
  formatCurrency,
  exportToCsv,
} from '../../utils/inventoryLogic';
import { MaterialCategory, Product } from '../../types';
import {
  Button,
  Dialog,
  EmptyState,
  Input,
  MetricTile,
  PageHeading,
  Select,
  StatusIndicator,
} from '../ui/Primitives';
import { MaterialSpecimenThumb } from '../ui/MaterialSpecimenThumb';

const INVENTORY_CATEGORIES: Array<'All' | MaterialCategory> = [
  'All',
  'Cement',
  'Steel',
  'Bricks',
  'Pipes',
  'Timber',
  'Aggregates',
];

export const InventoryScreen: React.FC = () => {
  const {
    products,
    sales,
    purchases,
    movements,
    settings,
    adjustStockQuantity,
    saveProduct,
    setScreen,
    inventoryFilterPreset,
    setInventoryFilterPreset,
    addToast,
  } = useStore();

  const [filterMode, setFilterMode] = useState<'all' | 'low'>(inventoryFilterPreset || 'all');
  const [selectedCategory, setSelectedCategory] = useState<'All' | MaterialCategory>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>(
    products[0]?.id || ''
  );
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('add');
  const [adjustQty, setAdjustQty] = useState<string>('10');
  const [adjustReason, setAdjustReason] = useState<string>(
    'Physical yard inventory reconciliation'
  );
  const [adjustError, setAdjustError] = useState<string>('');

  // Threshold Configuration Modal State
  const [thresholdProduct, setThresholdProduct] = useState<Product | null>(null);
  const [newMinThreshold, setNewMinThreshold] = useState<string>('30');
  const [savingThreshold, setSavingThreshold] = useState<boolean>(false);
  const [restockingId, setRestockingId] = useState<string | null>(null);

  useEffect(() => {
    setFilterMode(inventoryFilterPreset);
  }, [inventoryFilterPreset]);

  const handleFilterModeChange = (mode: 'all' | 'low') => {
    setFilterMode(mode);
    setInventoryFilterPreset(mode);
  };

  const metrics = useMemo(
    () => computeDashboardMetrics(products, sales, purchases),
    [products, sales, purchases]
  );

  const lowStockSummary = useMemo(
    () => evaluateLowStockAlerts(products, settings.lowStockGlobalThreshold),
    [products, settings.lowStockGlobalThreshold]
  );

  const displayedProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const effectiveThreshold =
        p.minStockLevel > 0 ? p.minStockLevel : settings.lowStockGlobalThreshold || 0;
      if (filterMode === 'low' && p.quantity > effectiveThreshold) return false;
      if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.sku.toLowerCase().includes(q) &&
        !p.location.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [products, filterMode, selectedCategory, searchQuery, settings.lowStockGlobalThreshold]);

  const handleOpenAdjust = (productId?: string, defaultAddQty?: number) => {
    if (productId) setSelectedProductId(productId);
    else if (products[0]) setSelectedProductId(products[0].id);
    setAdjustType('add');
    setAdjustQty(defaultAddQty ? String(defaultAddQty) : '10');
    setAdjustError('');
    setAdjustModalOpen(true);
  };

  const handleOpenThresholdEditor = (product: Product) => {
    setThresholdProduct(product);
    setNewMinThreshold(String(product.minStockLevel));
  };

  const handleSaveThreshold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thresholdProduct) return;
    const parsed = Math.max(0, Math.round(Number(newMinThreshold) || 0));
    setSavingThreshold(true);
    try {
      await saveProduct({
        ...thresholdProduct,
        minStockLevel: parsed,
      });
      setThresholdProduct(null);
    } finally {
      setSavingThreshold(false);
    }
  };

  const handleQuickRestockRecommended = async (productId: string, recommendedQty: number) => {
    setRestockingId(productId);
    try {
      await adjustStockQuantity(
        productId,
        recommendedQty,
        `Automated low-stock alert replenishment (+${recommendedQty})`
      );
    } finally {
      setRestockingId(null);
    }
  };

  const handleExportLowStockCsv = () => {
    if (lowStockSummary.alerts.length === 0) return;
    exportToCsv(
      `buildflow_low_stock_alerts_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Severity',
        'SKU',
        'Material Name',
        'Category',
        'Warehouse Bay',
        'Supplier Mill',
        'Unit',
        'Available Stock',
        'Minimum Threshold',
        'Unit Deficit',
        'Recommended Reorder Qty',
        'Purchase Price (INR)',
        'Est. Replenishment Cost (INR)',
      ],
      lowStockSummary.alerts.map((a) => [
        a.severity.toUpperCase(),
        a.product.sku,
        a.product.name,
        a.product.category,
        a.product.location,
        a.product.supplierName,
        a.product.unit,
        a.product.quantity,
        a.effectiveThreshold,
        a.deficit,
        a.recommendedOrderQty,
        a.product.purchasePrice.toFixed(2),
        a.estimatedRestockCost.toFixed(2),
      ])
    );
    addToast(
      'Low Stock Alerts Exported',
      `Exported ${lowStockSummary.totalAlertsCount} flagged materials to CSV for procurement.`,
      'success'
    );
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError('');
    const targetId = selectedProductId || products[0]?.id;
    if (!targetId) {
      setAdjustError('Please add a building material to the catalogue first.');
      return;
    }
    const num = parseFloat(adjustQty);
    if (isNaN(num) || num <= 0) {
      setAdjustError('Please enter a valid positive quantity.');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('An audit reason is required for stock adjustments.');
      return;
    }
    const delta = adjustType === 'add' ? num : -num;
    try {
      await adjustStockQuantity(targetId, delta, adjustReason);
      setAdjustModalOpen(false);
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'Unable to adjust stock.');
    }
  };

  return (
    <div className="space-y-8">
      <PageHeading
        kicker="YARD STOCK, THRESHOLD ALERTS & LEDGER MOVEMENTS"
        title="Inventory Management"
        subtitle="Inspect live stock levels across bays, monitor low-stock threshold alerts, and log audited quantity adjustments."
        actions={
          <>
            {lowStockSummary.totalAlertsCount > 0 && (
              <Button
                variant="outline"
                size="md"
                onClick={handleExportLowStockCsv}
              >
                <Download className="w-4 h-4" />
                <span>Export Low Stock CSV ({lowStockSummary.totalAlertsCount})</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="md"
              onClick={() => handleOpenAdjust()}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Adjust Stock</span>
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => setScreen('purchase-entry')}
            >
              <Plus className="w-4 h-4" />
              <span>Receive Purchase</span>
            </Button>
          </>
        }
      />

      {/* Inventory Valuation & Threshold Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricTile
          label="Stock Valuation (Cost)"
          value={formatCurrency(metrics.inventoryValuation, settings.currencySymbol)}
          meta="Based on current landed purchase prices"
          accent="green"
        />
        <MetricTile
          label="Total Units on Hand"
          value={metrics.totalUnitsInStock.toLocaleString('en-IN')}
          meta={`Across ${metrics.totalProductsCount} active SKUs`}
          onClick={() => handleFilterModeChange('all')}
        />
        <MetricTile
          label="Low-Stock Alerts"
          value={`${lowStockSummary.totalAlertsCount} SKUs`}
          meta={
            lowStockSummary.totalAlertsCount > 0
              ? `${lowStockSummary.criticalCount} critical · ${lowStockSummary.warningCount} warning`
              : 'All SKUs above minimum threshold'
          }
          accent={lowStockSummary.totalAlertsCount > 0 ? 'terracotta' : 'default'}
          onClick={() => handleFilterModeChange('low')}
        />
        <MetricTile
          label="Est. Replenishment Outlay"
          value={formatCurrency(
            lowStockSummary.totalEstimatedRestockCost,
            settings.currencySymbol
          )}
          meta={`${lowStockSummary.totalDeficitUnits.toLocaleString('en-IN')} units short of threshold`}
        />
      </div>

      {/* Dedicated Low Stock Alert System Panel */}
      <section
        aria-label="Low Stock Alert System"
        className={`border p-6 ${
          lowStockSummary.totalAlertsCount > 0
            ? 'bg-[#FDF3F1] border-[#BD704F]'
            : 'bg-[#FFFFFF] border-[#E7E4DC]'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E7E4DC]">
          <div className="flex items-start gap-3">
            <div
              className={`p-2 border shrink-0 mt-0.5 ${
                lowStockSummary.totalAlertsCount > 0
                  ? 'bg-[#FFFFFF] border-[#BD704F] text-[#9E3B24]'
                  : 'bg-[#F7F6F2] border-[#E7E4DC] text-[#315744]'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-wider text-[#9E3B24]">
                  LOW STOCK ALERT SYSTEM · THRESHOLD MONITOR
                </span>
                {lowStockSummary.criticalCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-[#9E3B24] text-white">
                    {lowStockSummary.criticalCount} CRITICAL / OUT OF STOCK
                  </span>
                )}
                {lowStockSummary.warningCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-[#BD704F] text-white">
                    {lowStockSummary.warningCount} BELOW THRESHOLD
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-[#252923] font-display mt-0.5">
                {lowStockSummary.totalAlertsCount > 0
                  ? `${lowStockSummary.totalAlertsCount} ${
                      lowStockSummary.totalAlertsCount === 1
                        ? 'material requires'
                        : 'materials require'
                    } immediate yard replenishment`
                  : 'All yard materials are stocked above their defined minimum threshold'}
              </h2>
              <p className="text-xs text-[#777A73] mt-0.5">
                Products are automatically flagged when available quantity falls at or below
                their configured minimum stock threshold (global default:{' '}
                {settings.lowStockGlobalThreshold} units).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {lowStockSummary.totalAlertsCount > 0 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportLowStockCsv}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Replenishment Schedule</span>
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setScreen('purchase-entry')}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Create Supplier PO</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {lowStockSummary.totalAlertsCount === 0 ? (
          <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#777A73]">
            <span>
              No active low-stock alerts. You can click "Min Level" on any product row below to
              customize its alert threshold.
            </span>
            {products.length === 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setScreen('product-form')}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Material</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-5">
            {lowStockSummary.alerts.map((alert) => {
              const { product } = alert;
              const isRestocking = restockingId === product.id;
              return (
                <div
                  key={product.id}
                  className="bg-[#FFFFFF] border border-[#BD704F]/60 p-4 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                              alert.severity === 'critical'
                                ? 'bg-[#9E3B24] text-white'
                                : 'bg-[#BD704F] text-white'
                            }`}
                          >
                            {product.quantity <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'}
                          </span>
                          <span className="text-[11px] font-mono text-[#777A73]">
                            {product.sku}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-[#252923] mt-1.5 truncate">
                          {product.name}
                        </h3>
                        <div className="text-[11px] text-[#777A73] mt-0.5">
                          {product.location} · {product.supplierName}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-mono font-bold text-[#9E3B24]">
                          {product.quantity} / {alert.effectiveThreshold}
                        </div>
                        <div className="text-[10px] font-mono text-[#777A73]">
                          {product.unit}
                        </div>
                      </div>
                    </div>

                    {/* Threshold Coverage Progress Bar */}
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[#777A73]">
                          Coverage: {alert.stockCoveragePercent}%
                        </span>
                        <span className="text-[#9E3B24] font-semibold">
                          {alert.deficit > 0
                            ? `Short by ${alert.deficit} ${product.unit.split(' ')[0]}`
                            : 'At minimum threshold'}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#EFEEE8] overflow-hidden">
                        <div
                          className={`h-full ${
                            alert.severity === 'critical' ? 'bg-[#9E3B24]' : 'bg-[#BD704F]'
                          }`}
                          style={{ width: `${Math.max(4, alert.stockCoveragePercent)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E7E4DC] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenThresholdEditor(product)}
                      className="text-[11px] font-mono text-[#777A73] hover:text-[#252923] underline cursor-pointer"
                    >
                      Min: {alert.effectiveThreshold} (Edit)
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isRestocking}
                        onClick={() =>
                          void handleQuickRestockRecommended(
                            product.id,
                            alert.recommendedOrderQty
                          )
                        }
                        className="px-2.5 py-1 text-xs font-mono font-medium bg-[#315744] text-white hover:bg-[#264536] transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${isRestocking ? 'animate-spin' : ''}`}
                        />
                        <span>
                          {isRestocking
                            ? 'Adding...'
                            : `+Restock ${alert.recommendedOrderQty}`}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Main Split: Live Stock Levels Table + Stock Movement History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Stock Levels Table (Span 7) */}
        <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E7E4DC]">
          <div className="px-6 py-4 border-b border-[#E7E4DC] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#252923]">
                  Warehouse & Yard Stock Levels
                </h2>
                <p className="text-xs text-[#777A73]">
                  Real-time quantities and threshold status per material
                </p>
              </div>

              <div className="flex items-center gap-1 bg-[#F7F6F2] p-1 border border-[#E7E4DC]">
                <button
                  type="button"
                  onClick={() => handleFilterModeChange('all')}
                  className={`px-3 py-1 text-xs font-medium cursor-pointer ${
                    filterMode === 'all'
                      ? 'bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC]'
                      : 'text-[#777A73]'
                  }`}
                >
                  All ({products.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleFilterModeChange('low')}
                  className={`px-3 py-1 text-xs font-medium cursor-pointer ${
                    filterMode === 'low'
                      ? 'bg-[#FFFFFF] text-[#BD704F] border border-[#E7E4DC]'
                      : 'text-[#777A73]'
                  }`}
                >
                  Low Stock ({lowStockSummary.totalAlertsCount})
                </button>
              </div>
            </div>

            {/* Search & Category Filter Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1">
                {INVENTORY_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-[#315744] text-white'
                        : 'bg-[#F7F6F2] text-[#777A73] hover:text-[#252923]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-52">
                <Search className="w-3.5 h-3.5 text-[#777A73] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search inventory by name, SKU, or bay"
                  placeholder="Filter name, SKU, bay..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#315744]"
                />
              </div>
            </div>
          </div>

          {displayedProducts.length === 0 ? (
            <EmptyState
              title={
                products.length === 0
                  ? 'No materials in yard inventory yet'
                  : 'No materials match your filter'
              }
              description={
                products.length === 0
                  ? 'Add your first building material to start tracking bay quantities and stock movements.'
                  : 'Try selecting All categories or clearing the search filter.'
              }
              actionLabel={products.length === 0 ? 'Add Product' : 'Show All Stock'}
              onAction={() => {
                if (products.length === 0) setScreen('product-form');
                else {
                  handleFilterModeChange('all');
                  setSelectedCategory('All');
                  setSearchQuery('');
                }
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                    <th className="py-2.5 px-4">MATERIAL</th>
                    <th className="py-2.5 px-4">BAY</th>
                    <th className="py-2.5 px-4 text-right">AVAILABLE</th>
                    <th className="py-2.5 px-4 text-right">MIN LEVEL</th>
                    <th className="py-2.5 px-4">STATUS</th>
                    <th className="py-2.5 px-4 text-right">ADJUST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E4DC] text-xs">
                  {displayedProducts.map((product) => {
                    const effectiveMin =
                      product.minStockLevel > 0
                        ? product.minStockLevel
                        : settings.lowStockGlobalThreshold || 0;
                    const status = getStockStatus(product.quantity, effectiveMin);
                    const isFlagged = product.quantity <= effectiveMin;
                    return (
                      <tr
                        key={product.id}
                        className={
                          isFlagged
                            ? 'bg-[#FDF3F1]/60 hover:bg-[#FDF3F1]'
                            : 'hover:bg-[#F7F6F2]/60'
                        }
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <MaterialSpecimenThumb
                              category={product.category}
                              size="sm"
                            />
                            <div>
                              <div className="font-semibold text-[#252923] flex items-center gap-1.5">
                                <span>{product.name}</span>
                                {isFlagged && (
                                  <AlertTriangle
                                    className="w-3.5 h-3.5 text-[#BD704F] shrink-0"
                                    aria-label="Flagged low stock"
                                  />
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-[#777A73]">
                                {product.sku} · {product.unit}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#777A73] whitespace-nowrap">
                          {product.location}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                            isFlagged ? 'text-[#9E3B24]' : 'text-[#252923]'
                          }`}
                        >
                          {product.quantity}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          <button
                            type="button"
                            onClick={() => handleOpenThresholdEditor(product)}
                            title="Edit minimum stock alert threshold"
                            className="text-[#777A73] hover:text-[#252923] underline decoration-dotted cursor-pointer"
                          >
                            {effectiveMin}
                          </button>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <StatusIndicator status={status} />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenAdjust(product.id)}
                            className="text-xs font-medium text-[#315744] hover:underline cursor-pointer"
                          >
                            Adjust Qty
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stock Movement History Ledger (Span 5) */}
        <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#E7E4DC]">
          <div className="px-6 py-4 border-b border-[#E7E4DC]">
            <h2 className="text-base font-semibold text-[#252923]">
              Stock Movement History
            </h2>
            <p className="text-xs text-[#777A73]">
              Chronological audit log of inward receipts, sales, and adjustments
            </p>
          </div>

          <div className="divide-y divide-[#E7E4DC] max-h-[540px] overflow-y-auto">
            {movements.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#777A73]">
                No stock movements recorded yet.
              </div>
            ) : (
              movements.map((mov) => {
                const isPositive = mov.quantityDelta >= 0;
                return (
                  <div key={mov.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`p-1.5 border shrink-0 mt-0.5 ${
                          isPositive
                            ? 'bg-[#F7F6F2] border-[#315744]/30 text-[#315744]'
                            : 'bg-[#F7F6F2] border-[#BD704F]/30 text-[#BD704F]'
                        }`}
                      >
                        {isPositive ? (
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#252923] truncate">
                          {mov.productName}
                        </div>
                        <div className="text-[11px] text-[#777A73] mt-0.5">
                          {mov.reason}
                        </div>
                        <div className="text-[11px] font-mono text-[#777A73] mt-1">
                          {mov.referenceNumber} · Balance: {mov.previousStock} →{' '}
                          {mov.newStock}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`text-xs font-mono tabular-nums font-semibold shrink-0 ${
                        isPositive ? 'text-[#315744]' : 'text-[#BD704F]'
                      }`}
                    >
                      {isPositive ? `+${mov.quantityDelta}` : mov.quantityDelta}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Quantity Adjustment Dialog */}
      <Dialog
        open={adjustModalOpen}
        onClose={() => setAdjustModalOpen(false)}
        title="Adjust Stock Quantity"
        subtitle="Record a verified physical count addition or deduction in the stock movement ledger."
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4" noValidate>
          {adjustError && (
            <div className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-xs text-[#9E3B24]">
              {adjustError}
            </div>
          )}

          <Select
            label="Building Material"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            options={products.map((p) => ({
              value: p.id,
              label: `${p.name} (Current: ${p.quantity} ${p.unit} · Min: ${p.minStockLevel})`,
            }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Adjustment Type"
              value={adjustType}
              onChange={(e) => setAdjustType(e.target.value as 'add' | 'deduct')}
              options={[
                { value: 'add', label: 'Add Stock (+)' },
                { value: 'deduct', label: 'Deduct Stock (-)' },
              ]}
            />
            <Input
              label="Quantity"
              type="number"
              min="1"
              step="1"
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              required
            />
          </div>

          <Input
            label="Audit Reason / Reference Note"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E4DC]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdjustModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Confirm Adjustment
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Minimum Stock Alert Threshold Editor Dialog */}
      <Dialog
        open={Boolean(thresholdProduct)}
        onClose={() => setThresholdProduct(null)}
        title="Configure Low Stock Alert Threshold"
        subtitle={
          thresholdProduct
            ? `${thresholdProduct.name} (${thresholdProduct.sku}) · Current Stock: ${thresholdProduct.quantity} ${thresholdProduct.unit}`
            : ''
        }
      >
        {thresholdProduct && (
          <form onSubmit={handleSaveThreshold} className="space-y-4">
            <Input
              label={`Minimum Stock Alert Threshold (${thresholdProduct.unit})`}
              type="number"
              min="0"
              step="1"
              value={newMinThreshold}
              onChange={(e) => setNewMinThreshold(e.target.value)}
              required
            />
            <p className="text-xs text-[#777A73]">
              Whenever available stock for <strong>{thresholdProduct.name}</strong> falls at or
              below this level, it will be flagged in the Inventory Alert System and displayed
              prominently on the Dashboard.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E4DC]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setThresholdProduct(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={savingThreshold}>
                {savingThreshold ? 'Saving...' : 'Save Alert Threshold'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
};
