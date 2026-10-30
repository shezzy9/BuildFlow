import React, { useState, useMemo } from 'react';
import {
  Search,
  Bell,
  Plus,
  ArrowUpRight,
  AlertTriangle,
  FileText,
  ShoppingCart,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useStore } from '../../context/StoreContext';
import {
  computeDashboardMetrics,
  evaluateLowStockAlerts,
  filterRecordsByPeriod,
  formatCurrency,
  parseCartItemsSummary,
} from '../../utils/inventoryLogic';
import { DatePeriodFilter } from '../../types';
import { Button, MetricTile, StatusIndicator } from '../ui/Primitives';
import { MaterialSpecimenThumb } from '../ui/MaterialSpecimenThumb';

export const DashboardScreen: React.FC = () => {
  const {
    products,
    sales,
    purchases,
    settings,
    dashboardPeriod,
    setDashboardPeriod,
    setScreen,
    setSelectedInvoice,
    globalSearch,
    setGlobalSearch,
    setInventoryFilterPreset,
    adjustStockQuantity,
  } = useStore();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [recentTab, setRecentTab] = useState<'sales' | 'purchases'>('sales');
  const [restockingProductId, setRestockingProductId] = useState<string | null>(null);

  const periodSales = useMemo(
    () => filterRecordsByPeriod(sales, dashboardPeriod),
    [sales, dashboardPeriod]
  );

  const periodPurchases = useMemo(
    () => filterRecordsByPeriod(purchases, dashboardPeriod),
    [purchases, dashboardPeriod]
  );

  const metrics = useMemo(
    () => computeDashboardMetrics(products, sales, purchases, dashboardPeriod),
    [products, sales, purchases, dashboardPeriod]
  );

  const lowStockSummary = useMemo(
    () => evaluateLowStockAlerts(products, settings.lowStockGlobalThreshold),
    [products, settings.lowStockGlobalThreshold]
  );

  const lowStockItems = useMemo(
    () => lowStockSummary.alerts.map((a) => a.product),
    [lowStockSummary]
  );

  const handleQuickRestock = async (productId: string, recommendedQty: number) => {
    setRestockingProductId(productId);
    try {
      await adjustStockQuantity(
        productId,
        recommendedQty,
        'Quick replenishment from Dashboard Low Stock Alert'
      );
    } finally {
      setRestockingProductId(null);
    }
  };

  const pendingPurchases = useMemo(
    () => purchases.filter((p) => p.paymentStatus !== 'Paid'),
    [purchases]
  );

  // Build daily sales & procurement chart series dynamically from actual database records
  const salesTrendData = useMemo(() => {
    const days: Array<{ key: string; date: string; sales: number; purchases: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const isoDay = d.toISOString().slice(0, 10);
      const label =
        i === 0
          ? 'Today'
          : d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      days.push({ key: isoDay, date: label, sales: 0, purchases: 0 });
    }

    for (const s of sales) {
      const dayKey = (s.createdAt || '').slice(0, 10);
      const bucket = days.find((b) => b.key === dayKey);
      if (bucket) {
        bucket.sales = Math.round(bucket.sales + s.grandTotal);
      }
    }

    for (const p of purchases) {
      const dayKey = (p.createdAt || '').slice(0, 10);
      const bucket = days.find((b) => b.key === dayKey);
      if (bucket) {
        bucket.purchases = Math.round(bucket.purchases + p.totalAmount);
      }
    }

    return days;
  }, [sales, purchases]);

  // Compute top-selling products from filtered sales invoices
  const topSellingProducts = useMemo(() => {
    const map = new Map<
      string,
      {
        productId: string;
        name: string;
        sku: string;
        category: any;
        unitsSold: number;
        revenue: number;
      }
    >();

    for (const sale of periodSales) {
      const items =
        sale.items ||
        parseCartItemsSummary(sale.itemsSummary, {
          id: sale.primaryProductId,
          name: sale.primaryProductName,
          totalQuantity: sale.totalQuantity,
          subtotal: sale.subtotal,
        });

      for (const item of items) {
        const existing = map.get(item.productId);
        const prod = products.find((p) => p.id === item.productId);
        if (existing) {
          existing.unitsSold += item.quantity;
          existing.revenue += item.lineTotal;
        } else {
          map.set(item.productId, {
            productId: item.productId,
            name: prod?.name || item.productName,
            sku: prod?.sku || item.sku,
            category: prod?.category || item.category || 'Cement',
            unitsSold: item.quantity,
            revenue: item.lineTotal,
          });
        }
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [periodSales, products]);

  // Filter recent transactions by search query if typed
  const filteredTransactions = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return periodSales.slice(0, 6);
    return periodSales.filter(
      (s) =>
        s.invoiceNumber.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.customerCompany.toLowerCase().includes(q) ||
        s.primaryProductName.toLowerCase().includes(q)
    );
  }, [periodSales, globalSearch]);

  const filteredRecentPurchases = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return periodPurchases.slice(0, 6);
    return periodPurchases.filter(
      (p) =>
        p.poNumber.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        p.productName.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
    );
  }, [periodPurchases, globalSearch]);

  const formattedCurrentDate = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  const notificationCount = lowStockItems.length + pendingPurchases.length;

  return (
    <div className="space-y-8">
      {/* Header Row: Title, Date, Period Filter, Search, Notification Control, and Primary New Sale Action */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-[#E7E4DC]">
        <div>
          <div className="text-xs font-mono text-[#777A73] mb-1">
            {formattedCurrentDate} · {settings.warehouseAddress.split(',')[0]}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#252923] font-display tracking-tight">
            Good morning, welcome back.
          </h1>
        </div>

        <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 shrink-0">
          {/* Date Period Filter */}
          <div
            className="flex items-center bg-[#FFFFFF] border border-[#E7E4DC] p-0.5 shrink-0"
            role="group"
            aria-label="Dashboard Date Period"
          >
            {(
              [
                ['all', 'All Time'],
                ['30d', '30 Days'],
                ['7d', '7 Days'],
                ['today', 'Today'],
              ] as Array<[DatePeriodFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDashboardPeriod(key)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  dashboardPeriod === key
                    ? 'bg-[#315744] text-white'
                    : 'text-[#777A73] hover:text-[#252923]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search Field */}
          <div className="relative w-full sm:w-48 shrink-0">
            <Search className="w-4 h-4 text-[#777A73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search invoices, customers, or materials"
              placeholder="Search invoices, materials..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:border-[#315744]"
            />
          </div>

          {/* Notification Control */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setNotificationsOpen((prev) => !prev)}
              aria-label={`Notifications (${notificationCount} alerts)`}
              aria-expanded={notificationsOpen}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC] hover:bg-[#EFEEE8] transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4 text-[#777A73]" />
              <span className="font-mono tabular-nums">{notificationCount}</span>
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-[#FFFFFF] border border-[#E7E4DC] shadow-sm z-30 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#E7E4DC] pb-2">
                  <span className="text-xs font-semibold text-[#252923]">
                    Yard & Stock Alerts
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-[11px] text-[#777A73] hover:text-[#252923]"
                  >
                    Close
                  </button>
                </div>

                {lowStockItems.length === 0 && pendingPurchases.length === 0 ? (
                  <p className="text-xs text-[#777A73] py-2">
                    All material silos and bays are above threshold.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto">
                    {lowStockItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-2 text-xs pb-2 border-b border-[#E7E4DC]/60"
                      >
                        <div>
                          <div className="font-medium text-[#252923]">{item.name}</div>
                          <div className="text-[11px] text-[#BD704F]">
                            Low stock: {item.quantity} {item.unit} remaining (min{' '}
                            {item.minStockLevel})
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setNotificationsOpen(false);
                            setScreen('purchase-entry');
                          }}
                          className="text-[11px] font-medium text-[#315744] hover:underline shrink-0 cursor-pointer"
                        >
                          Restock
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Primary New Sale Action */}
          <Button
            variant="primary"
            size="md"
            onClick={() => setScreen('pos-billing')}
          >
            <Plus className="w-4 h-4" />
            <span>New Sale</span>
          </Button>
        </div>
      </div>

      {/* Prominent Low Stock Alert Banner (Displayed when any SKU falls at or below minimum threshold) */}
      {lowStockSummary.totalAlertsCount > 0 && (
        <section
          aria-label="Low Stock Alert Banner"
          className="bg-[#FDF3F1] border border-[#BD704F] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2 bg-[#FFFFFF] border border-[#BD704F] text-[#9E3B24] shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-wider text-[#9E3B24]">
                  LOW STOCK ALERT SYSTEM · IMMEDIATE REPLENISHMENT REQUIRED
                </span>
                {lowStockSummary.criticalCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-[#9E3B24] text-white">
                    {lowStockSummary.criticalCount} CRITICAL
                  </span>
                )}
                {lowStockSummary.warningCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-[#BD704F] text-white">
                    {lowStockSummary.warningCount} WARNING
                  </span>
                )}
              </div>
              <p className="text-xs text-[#252923] leading-relaxed">
                <strong>{lowStockSummary.totalAlertsCount}</strong> building{' '}
                {lowStockSummary.totalAlertsCount === 1 ? 'material has' : 'materials have'}{' '}
                fallen at or below defined minimum threshold (total deficit:{' '}
                <span className="font-mono font-semibold">
                  {lowStockSummary.totalDeficitUnits.toLocaleString('en-IN')} units
                </span>{' '}
                · est. restock cost:{' '}
                <span className="font-mono font-semibold text-[#9E3B24]">
                  {formatCurrency(
                    lowStockSummary.totalEstimatedRestockCost,
                    settings.currencySymbol
                  )}
                </span>
                ).
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {lowStockSummary.alerts.slice(0, 4).map((alert) => (
                  <button
                    key={alert.product.id}
                    type="button"
                    onClick={() => {
                      setInventoryFilterPreset('low');
                      setScreen('inventory');
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] bg-[#FFFFFF] border border-[#BD704F]/50 text-[#252923] hover:border-[#9E3B24] transition-colors cursor-pointer"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        alert.severity === 'critical' ? 'bg-[#9E3B24]' : 'bg-[#BD704F]'
                      }`}
                    />
                    <span className="font-medium">{alert.product.name}</span>
                    <span className="font-mono text-[#9E3B24]">
                      ({alert.product.quantity}/{alert.effectiveThreshold}{' '}
                      {alert.product.unit.split(' ')[0]})
                    </span>
                  </button>
                ))}
                {lowStockSummary.totalAlertsCount > 4 && (
                  <span className="text-[11px] font-mono text-[#9E3B24]">
                    +{lowStockSummary.totalAlertsCount - 4} more
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setInventoryFilterPreset('low');
                setScreen('inventory');
              }}
            >
              <span>Inspect Alerts in Inventory</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setScreen('purchase-entry')}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Order Replenishment</span>
            </Button>
          </div>
        </section>
      )}

      {/* Four Compact Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricTile
          label="Total Sales"
          value={formatCurrency(metrics.totalSalesRevenue, settings.currencySymbol)}
          meta={`${periodSales.length} invoices · ${formatCurrency(
            metrics.outstandingReceivables,
            settings.currencySymbol
          )} receivable`}
          accent="green"
          onClick={() => setScreen('sales-history')}
        />
        <MetricTile
          label="Purchases"
          value={formatCurrency(metrics.totalPurchasesSpend, settings.currencySymbol)}
          meta={`${periodPurchases.length} supplier purchase orders`}
          onClick={() => setScreen('purchase-history')}
        />
        <MetricTile
          label="Products in Stock"
          value={`${metrics.totalProductsCount} SKUs`}
          meta={`${metrics.totalUnitsInStock.toLocaleString('en-IN')} units · Valued at ${formatCurrency(
            metrics.inventoryRetailValue,
            settings.currencySymbol
          )}`}
          onClick={() => setScreen('products')}
        />
        <MetricTile
          label="Low Stock Alerts"
          value={`${lowStockSummary.totalAlertsCount} Materials`}
          meta={
            lowStockSummary.totalAlertsCount > 0
              ? `${lowStockSummary.criticalCount} critical · ${lowStockSummary.warningCount} warning`
              : 'All materials adequately stocked'
          }
          accent={lowStockSummary.totalAlertsCount > 0 ? 'terracotta' : 'default'}
          onClick={() => {
            setInventoryFilterPreset(lowStockSummary.totalAlertsCount > 0 ? 'low' : 'all');
            setScreen('inventory');
          }}
        />
      </div>

      {/* Middle Row: Sales Trend Chart (Span 8) + Low-Stock Materials List (Span 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Sales Trend Chart */}
        <div className="lg:col-span-8 bg-[#FFFFFF] border border-[#E7E4DC] p-6 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <div className="text-xs font-mono text-[#777A73]">
                REVENUE & PROCUREMENT TREND
              </div>
              <h2 className="text-base font-semibold text-[#252923] mt-0.5">
                7-Day Sales Dispatch vs. Inward Purchases ({settings.currencySymbol})
              </h2>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#777A73]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#315744] inline-block" />
                <span>Sales Revenue</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#BD704F] inline-block" />
                <span>Purchases</span>
              </span>
            </div>
          </div>

          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={salesTrendData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="#E7E4DC" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#777A73', fontSize: 11 }}
                  axisLine={{ stroke: '#E7E4DC' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#777A73', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) =>
                    val >= 1000
                      ? `${settings.currencySymbol}${(val / 1000).toFixed(0)}k`
                      : `${settings.currencySymbol}${val}`
                  }
                />
                <Tooltip
                  formatter={(value: any) =>
                    formatCurrency(Number(value || 0), settings.currencySymbol)
                  }
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E7E4DC',
                    fontSize: '12px',
                    color: '#252923',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  name="Sales"
                  stroke="#315744"
                  strokeWidth={2}
                  fill="#315744"
                  fillOpacity={0.12}
                />
                <Area
                  type="monotone"
                  dataKey="purchases"
                  name="Purchases"
                  stroke="#BD704F"
                  strokeWidth={1.75}
                  fill="#BD704F"
                  fillOpacity={0.07}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low-Stock Materials List */}
        <div className="lg:col-span-4 bg-[#FFFFFF] border border-[#E7E4DC] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-mono text-[#BD704F]">
                  REPLENISHMENT QUEUE · LOW STOCK ALERTS
                </div>
                <h2 className="text-base font-semibold text-[#252923] mt-0.5">
                  Low-Stock Materials ({lowStockSummary.totalAlertsCount})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInventoryFilterPreset('low');
                  setScreen('inventory');
                }}
                className="text-xs font-medium text-[#315744] hover:underline cursor-pointer"
              >
                Manage Thresholds
              </button>
            </div>

            {lowStockSummary.totalAlertsCount === 0 ? (
              <div className="py-8 space-y-2">
                <p className="text-xs text-[#777A73]">
                  All building materials are currently stocked above their minimum threshold.
                </p>
                {products.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setScreen('product-form')}
                    className="text-xs font-medium text-[#315744] hover:underline cursor-pointer"
                  >
                    + Add first material with minimum threshold →
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[#E7E4DC] max-h-80 overflow-y-auto pr-1">
                {lowStockSummary.alerts.map((alert) => {
                  const { product } = alert;
                  const isRestocking = restockingProductId === product.id;
                  return (
                    <div key={product.id} className="py-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase ${
                                alert.severity === 'critical'
                                  ? 'bg-[#FDF3F1] text-[#9E3B24] border border-[#BD704F]'
                                  : 'bg-[#F7F6F2] text-[#BD704F] border border-[#E7E4DC]'
                              }`}
                            >
                              {product.quantity <= 0 ? 'Out of Stock' : alert.severity}
                            </span>
                            <span className="text-xs font-semibold text-[#252923] truncate">
                              {product.name}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#777A73] mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono">{product.sku}</span>
                            <span aria-hidden="true">·</span>
                            <span>{product.location}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Min Threshold:{' '}
                              <strong className="font-mono text-[#252923]">
                                {alert.effectiveThreshold}
                              </strong>
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className={`text-xs font-mono tabular-nums font-bold ${
                              alert.severity === 'critical'
                                ? 'text-[#9E3B24]'
                                : 'text-[#BD704F]'
                            }`}
                          >
                            {product.quantity} / {alert.effectiveThreshold}{' '}
                            {product.unit.split(' ')[0]}
                          </div>
                          <div className="text-[10px] font-mono text-[#777A73]">
                            {alert.deficit > 0
                              ? `Deficit: -${alert.deficit}`
                              : 'At threshold'}
                          </div>
                        </div>
                      </div>

                      {/* Visual Threshold Progress Bar */}
                      <div className="w-full h-1.5 bg-[#EFEEE8] overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            alert.severity === 'critical' ? 'bg-[#9E3B24]' : 'bg-[#BD704F]'
                          }`}
                          style={{ width: `${Math.max(4, alert.stockCoveragePercent)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-[11px] text-[#777A73]">
                          Rec. order:{' '}
                          <span className="font-mono font-medium text-[#252923]">
                            +{alert.recommendedOrderQty} {product.unit.split(' ')[0]}
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isRestocking}
                            onClick={() =>
                              void handleQuickRestock(product.id, alert.recommendedOrderQty)
                            }
                            className="px-2 py-0.5 text-[11px] font-mono font-medium bg-[#EDF3F0] text-[#315744] border border-[#315744]/40 hover:bg-[#315744] hover:text-white transition-colors cursor-pointer"
                          >
                            {isRestocking
                              ? 'Restocking...'
                              : `+Restock ${alert.recommendedOrderQty}`}
                          </button>
                          <button
                            type="button"
                            onClick={() => setScreen('purchase-entry')}
                            className="text-[11px] font-medium text-[#315744] hover:underline cursor-pointer"
                          >
                            Order PO
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-[#E7E4DC] flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                setInventoryFilterPreset('low');
                setScreen('inventory');
              }}
            >
              <span>Alert Center</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={() => setScreen('purchase-entry')}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>New Purchase PO</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Sales / Recent Purchases Table (Span 8) + Top-Selling Products (Span 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-[#FFFFFF] border border-[#E7E4DC]">
          <div className="px-6 py-4 border-b border-[#E7E4DC] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setRecentTab('sales')}
                className={`text-sm font-semibold pb-1 border-b-2 transition-colors cursor-pointer ${
                  recentTab === 'sales'
                    ? 'text-[#252923] border-[#315744]'
                    : 'text-[#777A73] border-transparent hover:text-[#252923]'
                }`}
              >
                Recent Sales ({filteredTransactions.length})
              </button>
              <button
                type="button"
                onClick={() => setRecentTab('purchases')}
                className={`text-sm font-semibold pb-1 border-b-2 transition-colors cursor-pointer ${
                  recentTab === 'purchases'
                    ? 'text-[#252923] border-[#315744]'
                    : 'text-[#777A73] border-transparent hover:text-[#252923]'
                }`}
              >
                Recent Purchases ({filteredRecentPurchases.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setScreen(recentTab === 'sales' ? 'sales-history' : 'purchase-history')
              }
              className="text-xs font-medium text-[#315744] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{recentTab === 'sales' ? 'View All Sales' : 'View All Purchases'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentTab === 'sales' ? (
            filteredTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#777A73]">
                No matching sales transactions found for the selected period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                      <th className="py-2.5 px-4">INVOICE</th>
                      <th className="py-2.5 px-4">CUSTOMER</th>
                      <th className="py-2.5 px-4">PRIMARY MATERIAL</th>
                      <th className="py-2.5 px-4 text-right">AMOUNT</th>
                      <th className="py-2.5 px-4">STATUS</th>
                      <th className="py-2.5 px-4 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E4DC] text-xs">
                    {filteredTransactions.map((sale) => (
                      <tr key={sale.id} className="hover:bg-[#F7F6F2]/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-[#252923] whitespace-nowrap">
                          {sale.invoiceNumber}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#252923]">{sale.customerName}</div>
                          <div className="text-[11px] text-[#777A73]">
                            {sale.customerCompany}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#777A73]">
                          {sale.primaryProductName}
                          {sale.itemCount > 1 && (
                            <span className="text-[11px] font-mono text-[#252923] ml-1">
                              (+{sale.itemCount - 1} more)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#252923] whitespace-nowrap">
                          {formatCurrency(sale.grandTotal, settings.currencySymbol)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusIndicator
                            status={sale.paymentStatus}
                            detail={sale.paymentMethod}
                          />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(sale);
                              setScreen('invoice-detail');
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#315744] hover:underline cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Invoice</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : filteredRecentPurchases.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#777A73]">
              No matching purchase orders found for the selected period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                    <th className="py-2.5 px-4">PO NUMBER</th>
                    <th className="py-2.5 px-4">SUPPLIER</th>
                    <th className="py-2.5 px-4">MATERIAL</th>
                    <th className="py-2.5 px-4 text-right">QTY</th>
                    <th className="py-2.5 px-4 text-right">TOTAL</th>
                    <th className="py-2.5 px-4">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E4DC] text-xs">
                  {filteredRecentPurchases.map((po) => (
                    <tr key={po.id} className="hover:bg-[#F7F6F2]/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-[#252923] whitespace-nowrap">
                        {po.poNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#252923]">
                        {po.supplierName}
                      </td>
                      <td className="py-3 px-4 text-[#777A73]">{po.productName}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#252923]">
                        +{po.quantity}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#252923] whitespace-nowrap">
                        {formatCurrency(po.totalAmount, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusIndicator status={po.paymentStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top-Selling Products Section */}
        <div className="lg:col-span-4 bg-[#FFFFFF] border border-[#E7E4DC] p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-mono text-[#777A73]">DEMAND LEADERS</div>
              <h2 className="text-base font-semibold text-[#252923] mt-0.5">
                Top-Selling Materials
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setScreen('reports')}
              className="text-xs font-medium text-[#315744] hover:underline cursor-pointer"
            >
              Analytics
            </button>
          </div>

          <div className="divide-y divide-[#E7E4DC]">
            {topSellingProducts.map((item) => (
              <div key={item.productId} className="py-3.5 flex items-center gap-3">
                <MaterialSpecimenThumb category={item.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[#252923] truncate">
                    {item.name}
                  </div>
                  <div className="text-[11px] text-[#777A73] font-mono mt-0.5">
                    {item.sku} · {item.unitsSold} units dispatched
                  </div>
                </div>
                <div className="text-right shrink-0 font-mono tabular-nums text-xs font-semibold text-[#315744]">
                  {formatCurrency(item.revenue, settings.currencySymbol)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
