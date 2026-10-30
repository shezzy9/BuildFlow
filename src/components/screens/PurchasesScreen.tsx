import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  History,
  CheckCircle2,
  Trash2,
  Eye,
  Printer,
  Download,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { PaymentStatus, PurchaseItem, PurchaseOrder } from '../../types';
import { calculatePurchaseTotals, formatCurrency } from '../../utils/inventoryLogic';
import { exportPurchasesToCsv } from '../../utils/exportUtils';
import {
  buildPrintablePurchaseOrderHtml,
  downloadPrintableHtml,
  numberToIndianWords,
  triggerDocumentPrint,
} from '../../utils/printUtils';
import {
  Button,
  Dialog,
  EmptyState,
  Input,
  PageHeading,
  Select,
  StatusIndicator,
} from '../ui/Primitives';

export const PurchasesScreen: React.FC = () => {
  const {
    screen,
    setScreen,
    suppliers,
    products,
    purchases,
    settings,
    recordPurchase,
    addToast,
  } = useStore();

  const activeTab: 'entry' | 'history' =
    screen === 'purchase-history' ? 'history' : 'entry';

  // Purchase Entry Form State
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [productSearch, setProductSearch] = useState('');
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [quantity, setQuantity] = useState('50');
  const [unitPrice, setUnitPrice] = useState(
    products[0] ? String(products[0].purchasePrice) : '340'
  );
  const [orderItems, setOrderItems] = useState<PurchaseItem[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid');
  const [notes, setNotes] = useState(
    'Delivered with mill compliance certification to main yard.'
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // History filter & detail modal
  const [historySearch, setHistorySearch] = useState('');
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseOrder | null>(null);

  const filteredProductsForPicker = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const selectedProduct = products.find((p) => p.id === productId) || products[0];

  const handleSelectProduct = (newId: string) => {
    setProductId(newId);
    const found = products.find((p) => p.id === newId);
    if (found) {
      setUnitPrice(String(found.purchasePrice));
    }
  };

  const qtyNum = Math.max(0, parseFloat(quantity) || 0);
  const priceNum = Math.max(0, parseFloat(unitPrice) || 0);

  const handleAddLineToOrder = () => {
    setErrorMsg('');
    if (!selectedProduct) {
      setErrorMsg('Please select a building material.');
      return;
    }
    if (qtyNum <= 0) {
      setErrorMsg('Quantity must be greater than zero.');
      return;
    }
    if (priceNum <= 0) {
      setErrorMsg('Unit purchase price must be greater than zero.');
      return;
    }

    setOrderItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === selectedProduct.id);
      if (idx !== -1) {
        const next = [...prev];
        const newQty = next[idx].quantity + qtyNum;
        next[idx] = {
          ...next[idx],
          quantity: newQty,
          unitPrice: priceNum,
          lineTotal: Number((newQty * priceNum).toFixed(2)),
        };
        return next;
      }
      return [
        ...prev,
        {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          sku: selectedProduct.sku,
          unit: selectedProduct.unit,
          quantity: qtyNum,
          unitPrice: priceNum,
          lineTotal: Number((qtyNum * priceNum).toFixed(2)),
        },
      ];
    });
  };

  const handleRemoveOrderLine = (prodId: string) => {
    setOrderItems((prev) => prev.filter((i) => i.productId !== prodId));
  };

  // Effective items: if orderItems has entries, use those; otherwise use the current form selection
  const effectiveItems: PurchaseItem[] = useMemo(() => {
    if (orderItems.length > 0) return orderItems;
    if (!selectedProduct || qtyNum <= 0 || priceNum <= 0) return [];
    return [
      {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        sku: selectedProduct.sku,
        unit: selectedProduct.unit,
        quantity: qtyNum,
        unitPrice: priceNum,
        lineTotal: Number((qtyNum * priceNum).toFixed(2)),
      },
    ];
  }, [orderItems, selectedProduct, qtyNum, priceNum]);

  const totals = useMemo(
    () => calculatePurchaseTotals(effectiveItems, settings.defaultTaxRate),
    [effectiveItems, settings.defaultTaxRate]
  );

  const effectiveSupplierId = supplierId || suppliers[0]?.id || '';

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!effectiveSupplierId) {
      setErrorMsg('Please add or select a supplier first.');
      return;
    }
    if (effectiveItems.length === 0) {
      setErrorMsg('Please select a material and enter a valid quantity and unit price.');
      return;
    }

    setSubmitting(true);
    try {
      await recordPurchase({
        supplierId: effectiveSupplierId,
        productId: effectiveItems[0].productId,
        quantity: effectiveItems[0].quantity,
        unitPrice: effectiveItems[0].unitPrice,
        items: effectiveItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        taxRate: settings.defaultTaxRate,
        paymentStatus,
        notes,
      });
      setOrderItems([]);
      setScreen('purchase-history');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record purchase.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPurchases = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(
      (p) =>
        p.poNumber.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        p.productName.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
    );
  }, [purchases, historySearch]);

  const parsePurchaseItems = (po: PurchaseOrder): PurchaseItem[] => {
    if (po.items && po.items.length > 0) return po.items;
    if (po.itemsSummary) {
      try {
        const parsed = JSON.parse(po.itemsSummary);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // fallback
      }
    }
    return [
      {
        productId: po.productId,
        productName: po.productName,
        sku: po.sku,
        unit: 'Units',
        quantity: po.quantity,
        unitPrice: po.unitPrice,
        lineTotal: Number((po.quantity * po.unitPrice).toFixed(2)),
      },
    ];
  };

  return (
    <div className="space-y-6">
      <PageHeading
        kicker="SUPPLIER PROCUREMENT & INWARD RECEIVING"
        title={activeTab === 'entry' ? 'Purchase Entry' : 'Purchase History'}
        subtitle="Record inward material deliveries from approved suppliers and automatically update warehouse inventory."
        actions={
          <div className="flex items-center gap-1 p-1 bg-[#FFFFFF] border border-[#E7E4DC]">
            <button
              type="button"
              onClick={() => setScreen('purchase-entry')}
              className={`px-3.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'entry'
                  ? 'bg-[#315744] text-white'
                  : 'text-[#252923] hover:bg-[#F7F6F2]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Purchase Entry</span>
            </button>
            <button
              type="button"
              onClick={() => setScreen('purchase-history')}
              className={`px-3.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-[#315744] text-white'
                  : 'text-[#252923] hover:bg-[#F7F6F2]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Purchase History ({purchases.length})</span>
            </button>
          </div>
        }
      />

      {activeTab === 'entry' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Purchase Entry Form (Span 8) */}
          <form
            onSubmit={handlePurchaseSubmit}
            className="lg:col-span-8 bg-[#FFFFFF] border border-[#E7E4DC] p-6 sm:p-8 space-y-6"
            noValidate
          >
            {errorMsg && (
              <div
                role="alert"
                className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-xs text-[#9E3B24]"
              >
                {errorMsg}
              </div>
            )}

            {(suppliers.length === 0 || products.length === 0) && (
              <div className="p-4 bg-[#F7F6F2] border border-[#E7E4DC] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="text-[#252923]">
                  To record a purchase order, ensure you have added at least one supplier and one building material.
                </div>
                <div className="flex items-center gap-2">
                  {suppliers.length === 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScreen('suppliers')}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Supplier</span>
                    </Button>
                  )}
                  {products.length === 0 && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => setScreen('product-form')}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Material</span>
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Select
                label="Supplier / Mill"
                value={effectiveSupplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                options={
                  suppliers.length > 0
                    ? suppliers.map((s) => ({
                        value: s.id,
                        label: `${s.name} (${s.code})`,
                      }))
                    : [{ value: '', label: 'No suppliers yet — add a supplier first' }]
                }
              />

              <Select
                label="Payment Status"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                options={[
                  { value: 'Paid', label: 'Paid in Full' },
                  { value: 'Partial', label: 'Partial Settlement' },
                  { value: 'Pending', label: 'Net-30 Trade Credit (Pending)' },
                ]}
              />
            </div>

            {/* Searchable Material Selection */}
            <div className="space-y-3 pt-2 border-t border-[#E7E4DC]">
              <Input
                label="Filter Catalogue Material"
                placeholder="Type material name or SKU to filter selection..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />

              <Select
                label="Select Material to Receive"
                value={selectedProduct?.id || ''}
                onChange={(e) => handleSelectProduct(e.target.value)}
                options={
                  filteredProductsForPicker.length > 0
                    ? filteredProductsForPicker.map((p) => ({
                        value: p.id,
                        label: `${p.name} [${p.sku}] — Current Stock: ${p.quantity} ${p.unit}`,
                      }))
                    : [{ value: '', label: 'No materials in catalogue yet' }]
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              <div className="sm:col-span-5">
                <Input
                  label={`Received Quantity (${selectedProduct?.unit || 'Units'})`}
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
              <div className="sm:col-span-5">
                <Input
                  label={`Unit Purchase Price (${settings.currencySymbol})`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  className="w-full"
                  onClick={handleAddLineToOrder}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line</span>
                </Button>
              </div>
            </div>

            {/* Multi-Item Purchase Order Lines Table (when user adds multiple lines) */}
            {orderItems.length > 0 && (
              <div className="border border-[#E7E4DC] bg-[#F7F6F2]/60">
                <div className="px-4 py-2 border-b border-[#E7E4DC] flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-[#252923]">
                    PURCHASE ORDER LINE ITEMS ({orderItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setOrderItems([])}
                    className="text-[11px] text-[#777A73] hover:text-[#9E3B24] cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                      <th className="py-2 px-3">MATERIAL</th>
                      <th className="py-2 px-3 text-right">QTY</th>
                      <th className="py-2 px-3 text-right">UNIT COST</th>
                      <th className="py-2 px-3 text-right">LINE TOTAL</th>
                      <th className="py-2 px-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E4DC]">
                    {orderItems.map((line) => (
                      <tr key={line.productId}>
                        <td className="py-2 px-3 font-medium text-[#252923]">
                          {line.productName} ({line.sku})
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          +{line.quantity} {line.unit}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatCurrency(line.unitPrice, settings.currencySymbol)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">
                          {formatCurrency(line.lineTotal, settings.currencySymbol)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveOrderLine(line.productId)}
                            className="p-1 text-[#777A73] hover:text-[#9E3B24] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Input
              label="Delivery & Batch Notes"
              placeholder="e.g., Delivered to Silo Bay A-01, batch test #882"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="pt-4 border-t border-[#E7E4DC] flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setScreen('purchase-history')}
              >
                View Purchase History
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting ? 'Recording...' : 'Record Purchase & Update Stock'}
                </span>
              </Button>
            </div>
          </form>

          {/* Right Summary Card (Span 4) */}
          <div className="lg:col-span-4 bg-[#FFFFFF] border border-[#E7E4DC] p-6 space-y-5">
            <div>
              <div className="text-xs font-mono text-[#315744]">
                PURCHASE SUMMARY & STOCK IMPACT
              </div>
              <h2 className="text-base font-semibold text-[#252923] mt-1">
                {orderItems.length > 1
                  ? `${orderItems.length} Material Lines Selected`
                  : selectedProduct?.name || 'Selected Material'}
              </h2>
              <div className="text-xs font-mono text-[#777A73] mt-0.5">
                SKU: {selectedProduct?.sku} · Bay: {selectedProduct?.location}
              </div>
            </div>

            <div className="p-4 bg-[#F7F6F2] border border-[#E7E4DC] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#777A73]">Current Available Stock</span>
                <span className="font-mono tabular-nums text-[#252923]">
                  {selectedProduct?.quantity || 0} {selectedProduct?.unit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#777A73]">Total Inward Delivery Qty</span>
                <span className="font-mono tabular-nums text-[#315744] font-semibold">
                  +{totals.totalQuantity} Units
                </span>
              </div>
              <div className="pt-2 border-t border-[#E7E4DC] flex items-center justify-between font-semibold">
                <span className="text-[#252923]">Projected Primary Balance</span>
                <span className="font-mono tabular-nums text-[#252923]">
                  {((selectedProduct?.quantity || 0) + qtyNum).toFixed(0)}{' '}
                  {selectedProduct?.unit}
                </span>
              </div>
            </div>

            <div className="space-y-2.5 text-xs pt-2 border-t border-[#E7E4DC]">
              <div className="flex items-center justify-between">
                <span className="text-[#777A73]">Net Material Subtotal</span>
                <span className="font-mono tabular-nums text-[#252923]">
                  {formatCurrency(totals.subtotal, settings.currencySymbol)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#777A73]">
                  Input GST ({settings.defaultTaxRate}%)
                </span>
                <span className="font-mono tabular-nums text-[#252923]">
                  {formatCurrency(totals.taxAmount, settings.currencySymbol)}
                </span>
              </div>
              <div className="pt-3 border-t border-[#E7E4DC] flex items-center justify-between text-sm font-semibold">
                <span className="text-[#252923]">Total Purchase Order</span>
                <span className="font-mono tabular-nums text-[#315744]">
                  {formatCurrency(totals.totalAmount, settings.currencySymbol)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Screen 7: Purchase History Table */
        <div className="bg-[#FFFFFF] border border-[#E7E4DC]">
          <div className="p-4 border-b border-[#E7E4DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#777A73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search purchase orders"
                placeholder="Search PO number, supplier, material..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#315744]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={filteredPurchases.length === 0}
                onClick={() => {
                  exportPurchasesToCsv(filteredPurchases);
                  addToast(
                    'Purchase orders exported',
                    `Exported ${filteredPurchases.length} purchase orders to CSV.`,
                    'success'
                  );
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV ({filteredPurchases.length})</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setScreen('purchase-entry')}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Purchase Entry</span>
              </Button>
            </div>
          </div>

          {filteredPurchases.length === 0 ? (
            <EmptyState
              title="No purchase orders found"
              description="Record an inward purchase entry to restock your building materials."
              actionLabel="Record Purchase"
              onAction={() => setScreen('purchase-entry')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                    <th className="py-3 px-4">PO NUMBER</th>
                    <th className="py-3 px-4">DATE</th>
                    <th className="py-3 px-4">SUPPLIER</th>
                    <th className="py-3 px-4">MATERIAL</th>
                    <th className="py-3 px-4 text-right">QTY RECEIVED</th>
                    <th className="py-3 px-4 text-right">UNIT PRICE</th>
                    <th className="py-3 px-4 text-right">TOTAL AMOUNT</th>
                    <th className="py-3 px-4">PAYMENT</th>
                    <th className="py-3 px-4 text-right">DETAILS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E4DC] text-xs">
                  {filteredPurchases.map((po) => (
                    <tr key={po.id} className="hover:bg-[#F7F6F2]/60">
                      <td className="py-3 px-4 font-mono font-semibold text-[#252923] whitespace-nowrap">
                        {po.poNumber}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#777A73] whitespace-nowrap">
                        {po.createdAt.slice(0, 10)}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#252923]">
                        {po.supplierName}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#252923]">{po.productName}</div>
                        <div className="text-[11px] font-mono text-[#777A73]">
                          {po.sku} · {po.notes}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#315744]">
                        +{po.quantity}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#777A73]">
                        {formatCurrency(po.unitPrice, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#252923]">
                        {formatCurrency(po.totalAmount, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusIndicator status={po.paymentStatus} detail={po.status} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewingPurchase(po)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#315744] hover:underline cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View PO</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const sup = suppliers.find((s) => s.id === po.supplierId);
                              const html = buildPrintablePurchaseOrderHtml(
                                po,
                                settings,
                                sup,
                                parsePurchaseItems(po)
                              );
                              triggerDocumentPrint(html);
                              setViewingPurchase(po);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[#EDF3F0] text-[#315744] hover:bg-[#315744] hover:text-white transition-colors cursor-pointer"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Print</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Printable Purchase Order Detail Modal */}
      <Dialog
        open={Boolean(viewingPurchase)}
        onClose={() => setViewingPurchase(null)}
        title={viewingPurchase ? `Purchase Order ${viewingPurchase.poNumber}` : 'Purchase Order'}
        subtitle={
          viewingPurchase
            ? `Supplier: ${viewingPurchase.supplierName} · Date: ${viewingPurchase.createdAt.slice(0, 10)}`
            : ''
        }
        maxWidth="max-w-xl"
      >
        {viewingPurchase && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between bg-[#F7F6F2] p-3 border border-[#E7E4DC]">
              <div>
                <div className="text-[#777A73]">Supplier</div>
                <div className="font-semibold text-[#252923]">
                  {viewingPurchase.supplierName}
                </div>
              </div>
              <StatusIndicator
                status={viewingPurchase.paymentStatus}
                detail={viewingPurchase.status}
              />
            </div>

            <div className="border border-[#E7E4DC]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                    <th className="py-2 px-3">MATERIAL</th>
                    <th className="py-2 px-3 text-right">QTY</th>
                    <th className="py-2 px-3 text-right">UNIT COST</th>
                    <th className="py-2 px-3 text-right">LINE TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E4DC]">
                  {parsePurchaseItems(viewingPurchase).map((item, idx) => (
                    <tr key={`${item.productId}_${idx}`}>
                      <td className="py-2 px-3">
                        <div className="font-medium text-[#252923]">{item.productName}</div>
                        <div className="text-[11px] font-mono text-[#777A73]">
                          {item.sku}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {item.quantity} {item.unit || ''}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {formatCurrency(item.unitPrice, settings.currencySymbol)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">
                        {formatCurrency(item.lineTotal, settings.currencySymbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-2.5 bg-[#F7F6F2] border border-[#E7E4DC] text-[#252923]">
              <span className="font-mono text-[10px] text-[#777A73] mr-2">AMOUNT IN WORDS:</span>
              <span className="font-semibold">
                {numberToIndianWords(viewingPurchase.totalAmount, settings.currencySymbol)}
              </span>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-[#E7E4DC]">
              <div className="flex justify-between">
                <span className="text-[#777A73]">Tax Amount</span>
                <span className="font-mono">
                  {formatCurrency(viewingPurchase.taxAmount, settings.currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-[#252923]">
                <span>Total Purchase Order</span>
                <span className="font-mono text-[#315744]">
                  {formatCurrency(viewingPurchase.totalAmount, settings.currencySymbol)}
                </span>
              </div>
            </div>

            {viewingPurchase.notes && (
              <div className="p-2.5 bg-[#F7F6F2] border border-[#E7E4DC] text-[#777A73]">
                Notes: {viewingPurchase.notes}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-[#E7E4DC]">
              <Button variant="outline" size="sm" onClick={() => setViewingPurchase(null)}>
                Close
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const sup = suppliers.find((s) => s.id === viewingPurchase.supplierId);
                  const html = buildPrintablePurchaseOrderHtml(
                    viewingPurchase,
                    settings,
                    sup,
                    parsePurchaseItems(viewingPurchase)
                  );
                  downloadPrintableHtml(
                    html,
                    `${viewingPurchase.poNumber.toLowerCase()}.html`
                  );
                  addToast(
                    'Printable PO downloaded',
                    `Downloaded ${viewingPurchase.poNumber} as a print-ready document.`,
                    'success'
                  );
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Printable PO</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  const sup = suppliers.find((s) => s.id === viewingPurchase.supplierId);
                  const html = buildPrintablePurchaseOrderHtml(
                    viewingPurchase,
                    settings,
                    sup,
                    parsePurchaseItems(viewingPurchase)
                  );
                  triggerDocumentPrint(html);
                  addToast(
                    `Printing ${viewingPurchase.poNumber}`,
                    'Sent Purchase Order to system print dialog.',
                    'success'
                  );
                }}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print PO</span>
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
