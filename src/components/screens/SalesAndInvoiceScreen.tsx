import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  FileText,
  CheckCircle2,
  ArrowLeft,
  History,
  CreditCard,
  Download,
  UserPlus,
  FileSpreadsheet,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  Customer,
  PaymentMethod,
  PaymentStatus,
  Product,
  SaleCartItem,
  SaleInvoice,
} from '../../types';
import {
  calculateSaleTotals,
  formatCurrency,
  getStockStatus,
  parseCartItemsSummary,
} from '../../utils/inventoryLogic';
import {
  exportSalesHistoryToCsv,
  exportSingleInvoiceToCsv,
} from '../../utils/exportUtils';
import {
  buildPrintableInvoiceHtml,
  downloadPrintableHtml,
  numberToIndianWords,
  triggerDocumentPrint,
  type InvoiceCopyType,
  type PrintPaperFormat,
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
import { MaterialSpecimenThumb } from '../ui/MaterialSpecimenThumb';

// Screen 8 & 10: Point of Sale (New Sale & Billing) + Sales History
export const SalesAndBillingScreen: React.FC = () => {
  const {
    screen,
    setScreen,
    products,
    customers,
    sales,
    settings,
    completeSale,
    recordPayment,
    saveCustomer,
    setSelectedInvoice,
    addToast,
  } = useStore();

  const activeMode: 'pos' | 'history' =
    screen === 'sales-history' ? 'history' : 'pos';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [customerId, setCustomerId] = useState<string>(customers[0]?.id || 'walk_in');
  const [cart, setCart] = useState<SaleCartItem[]>(() => {
    const first = products.find((p) => p.quantity > 0);
    if (!first) return [];
    return [
      {
        productId: first.id,
        productName: first.name,
        sku: first.sku,
        category: first.category,
        unit: first.unit,
        quantity: Math.min(5, first.quantity),
        availableStock: first.quantity,
        unitPrice: first.sellingPrice,
        lineTotal: Number((Math.min(5, first.quantity) * first.sellingPrice).toFixed(2)),
      },
    ];
  });
  const [discountInput, setDiscountInput] = useState<string>('0');
  const [taxRateInput, setTaxRateInput] = useState<string>(
    String(settings.defaultTaxRate)
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid');
  const [partialPaidInput, setPartialPaidInput] = useState<string>('');
  const [notes, setNotes] = useState<string>('Dispatched from main yard gate.');
  const [posError, setPosError] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Quick-add customer modal from POS counter
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [qcCompany, setQcCompany] = useState('');
  const [qcName, setQcName] = useState('');
  const [qcPhone, setQcPhone] = useState('+91 98450 11220');
  const [qcEmail, setQcEmail] = useState('');
  const [qcCity, setQcCity] = useState('Bengaluru, KA');
  const [qcGstin, setQcGstin] = useState('29AAACB1902P1Z8');
  const [qcTier, setQcTier] = useState<Customer['tier']>('Contractor');
  const [qcError, setQcError] = useState('');
  const [qcSaving, setQcSaving] = useState(false);

  // Sync default tax rate when settings change
  useEffect(() => {
    setTaxRateInput(String(settings.defaultTaxRate));
  }, [settings.defaultTaxRate]);

  // History filter & payment modal
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'All' | PaymentStatus>('All');
  const [historyMethodFilter, setHistoryMethodFilter] = useState<'All' | PaymentMethod>('All');
  const [payingInvoice, setPayingInvoice] = useState<SaleInvoice | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Bank Transfer');
  const [payReference, setPayReference] = useState<string>('');
  const [payError, setPayError] = useState<string>('');
  const [recordingPay, setRecordingPay] = useState<boolean>(false);

  const filteredCatalogue = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const catMatch = selectedCategory === 'All' || p.category === selectedCategory;
      const qMatch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      return catMatch && qMatch;
    });
  }, [products, searchQuery, selectedCategory]);

  const addToCart = (product: Product) => {
    setPosError('');
    if (product.quantity <= 0) {
      setPosError(`"${product.name}" is currently out of stock.`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.quantity) {
          setPosError(
            `Cannot exceed available stock (${product.quantity} ${product.unit}) for "${product.name}".`
          );
          return prev;
        }
        const nextQty = existing.quantity + 1;
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: nextQty,
                availableStock: product.quantity,
                lineTotal: Number((nextQty * item.unitPrice).toFixed(2)),
              }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          category: product.category,
          unit: product.unit,
          quantity: 1,
          availableStock: product.quantity,
          unitPrice: product.sellingPrice,
          lineTotal: Number(product.sellingPrice.toFixed(2)),
        },
      ];
    });
  };

  const updateCartQuantity = (productId: string, nextQty: number) => {
    setPosError('');
    const liveProduct = products.find((p) => p.id === productId);
    const maxAvail = liveProduct ? liveProduct.quantity : 0;

    if (nextQty <= 0) {
      setCart((prev) => prev.filter((item) => item.productId !== productId));
      return;
    }

    if (nextQty > maxAvail) {
      setPosError(
        `Cannot sell ${nextQty} units of "${liveProduct?.name}". Only ${maxAvail} available in stock.`
      );
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: nextQty,
              availableStock: maxAvail,
              lineTotal: Number((nextQty * item.unitPrice).toFixed(2)),
            }
          : item
      )
    );
  };

  const effectiveTaxRate = Math.max(0, parseFloat(taxRateInput) || 0);

  const totals = useMemo(
    () =>
      calculateSaleTotals(
        cart,
        parseFloat(discountInput) || 0,
        effectiveTaxRate
      ),
    [cart, discountInput, effectiveTaxRate]
  );

  const handleCompleteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setPosError('');

    if (cart.length === 0) {
      setPosError('Please add at least one building material to the bill.');
      return;
    }

    const amountPaid =
      paymentStatus === 'Paid'
        ? totals.grandTotal
        : paymentStatus === 'Partial'
        ? Math.max(0, parseFloat(partialPaidInput) || 0)
        : 0;

    setSubmitting(true);
    try {
      const createdInvoice = await completeSale({
        customerId: customerId || 'walk_in',
        cartItems: cart,
        discountAmount: parseFloat(discountInput) || 0,
        taxRate: effectiveTaxRate,
        paymentMethod,
        paymentStatus,
        amountPaid,
        notes,
      });
      setCart([]);
      setSelectedInvoice(createdInvoice);
      setScreen('invoice-detail');
    } catch (err) {
      setPosError(err instanceof Error ? err.message : 'Unable to complete sale.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSalesHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return sales.filter((s) => {
      if (historyStatusFilter !== 'All' && s.paymentStatus !== historyStatusFilter) {
        return false;
      }
      if (historyMethodFilter !== 'All' && s.paymentMethod !== historyMethodFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.invoiceNumber.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.customerCompany.toLowerCase().includes(q) ||
        s.primaryProductName.toLowerCase().includes(q)
      );
    });
  }, [sales, historySearch, historyStatusFilter, historyMethodFilter]);

  const handleExportSalesHistoryCsv = () => {
    if (filteredSalesHistory.length === 0) {
      addToast('No sales records to export', 'Complete a sale or adjust your filters to export invoices.', 'warning');
      return;
    }
    const dateStamp = new Date().toISOString().slice(0, 10);
    const statusSlug =
      historyStatusFilter === 'All' ? 'all' : historyStatusFilter.toLowerCase();
    exportSalesHistoryToCsv(
      filteredSalesHistory,
      `buildflow_sales_${statusSlug}_${dateStamp}.csv`
    );
    addToast(
      'Sales history exported to CSV',
      `Exported ${filteredSalesHistory.length} filtered ${filteredSalesHistory.length === 1 ? 'invoice' : 'invoices'} to CSV.`,
      'success'
    );
  };

  const openPaymentModal = (sale: SaleInvoice) => {
    const bal =
      sale.balanceDue !== undefined
        ? sale.balanceDue
        : sale.paymentStatus === 'Paid'
        ? 0
        : sale.grandTotal;
    setPayingInvoice(sale);
    setPayAmount(String(bal));
    setPayMethod('Bank Transfer');
    setPayReference(`UTR-${Date.now().toString().slice(-6)}`);
    setPayError('');
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;
    setPayError('');
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setPayError('Please enter a valid payment amount greater than zero.');
      return;
    }
    setRecordingPay(true);
    try {
      await recordPayment({
        invoiceId: payingInvoice.id,
        amount: amt,
        method: payMethod,
        reference: payReference,
      });
      setPayingInvoice(null);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setRecordingPay(false);
    }
  };

  const customerOptions = useMemo(
    () => [
      {
        value: 'walk_in',
        label: 'Walk-In Trade Customer (Cash / Direct Counter)',
      },
      ...customers.map((c) => ({
        value: c.id,
        label: `${c.company} (${c.name})`,
      })),
    ],
    [customers]
  );

  return (
    <div className="space-y-6">
      <PageHeading
        kicker="TRADE COUNTER POINT-OF-SALE & BILLING"
        title={activeMode === 'pos' ? 'New Sale & Billing' : 'Sales History & Invoices'}
        subtitle="Select building materials, verify live stock availability, apply trade discounts, and issue GST tax invoices."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportSalesHistoryCsv}
              disabled={filteredSalesHistory.length === 0}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to CSV ({filteredSalesHistory.length})</span>
            </Button>
            <div className="flex items-center gap-1 p-1 bg-[#FFFFFF] border border-[#E7E4DC]">
              <button
                type="button"
                onClick={() => setScreen('pos-billing')}
                className={`px-3.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                  activeMode === 'pos'
                    ? 'bg-[#315744] text-white'
                    : 'text-[#252923] hover:bg-[#F7F6F2]'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Sale (POS)</span>
              </button>
              <button
                type="button"
                onClick={() => setScreen('sales-history')}
                className={`px-3.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                  activeMode === 'history'
                    ? 'bg-[#315744] text-white'
                    : 'text-[#252923] hover:bg-[#F7F6F2]'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Sales History ({sales.length})</span>
              </button>
            </div>
          </div>
        }
      />

      {activeMode === 'pos' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Searchable Material Picker (Span 7) */}
          <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E7E4DC] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#777A73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search materials for billing"
                  placeholder="Search material name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#315744]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 bg-[#F7F6F2] p-1 border border-[#E7E4DC]">
                {['All', 'Cement', 'Steel', 'Bricks', 'Pipes', 'Timber', 'Aggregates'].map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC]'
                          : 'text-[#777A73]'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>
            </div>

            {filteredCatalogue.length === 0 ? (
              <EmptyState
                title={
                  products.length === 0
                    ? 'No building materials in catalogue yet'
                    : 'No materials match your filter'
                }
                description={
                  products.length === 0
                    ? 'Add your first building material to the catalogue to begin counter billing and issuing GST invoices.'
                    : 'Try clearing your search query or selecting All material categories.'
                }
                actionLabel="Add Product to Catalogue"
                onAction={() => setScreen('product-form')}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[540px] overflow-y-auto pr-1">
                {filteredCatalogue.map((product) => {
                  const status = getStockStatus(
                    product.quantity,
                    product.minStockLevel
                  );
                  const inCart = cart.find((c) => c.productId === product.id);
                  return (
                    <div
                      key={product.id}
                      className="p-3.5 bg-[#F7F6F2] border border-[#E7E4DC] flex flex-col justify-between gap-3 hover:border-[#315744] transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <MaterialSpecimenThumb category={product.category} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-mono text-[#777A73]">
                            {product.sku}
                          </div>
                          <div className="text-xs font-semibold text-[#252923] leading-snug">
                            {product.name}
                          </div>
                          <div className="mt-1">
                            <StatusIndicator
                              status={status}
                              detail={`${product.quantity} ${product.unit.split(' ')[0]}`}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-[#E7E4DC] flex items-center justify-between">
                        <div>
                          <span className="text-xs font-mono tabular-nums font-semibold text-[#252923]">
                            {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                          </span>
                          <span className="text-[11px] text-[#777A73]">
                            {' '}
                            / {product.unit}
                          </span>
                        </div>

                        <Button
                          type="button"
                          variant={inCart ? 'secondary' : 'primary'}
                          size="sm"
                          disabled={product.quantity <= 0}
                          onClick={() => addToCart(product)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{inCart ? `In Bill (${inCart.quantity})` : 'Add'}</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Active Bill & Checkout Cart (Span 5) */}
          <form
            onSubmit={handleCompleteSale}
            className="lg:col-span-5 bg-[#FFFFFF] border border-[#E7E4DC] p-6 space-y-5"
            noValidate
          >
            <div className="flex items-center justify-between border-b border-[#E7E4DC] pb-3">
              <div>
                <div className="text-xs font-mono text-[#315744]">ACTIVE COUNTER BILL</div>
                <h2 className="text-base font-semibold text-[#252923]">
                  Customer Dispatch & Invoice
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="text-[11px] font-mono text-[#777A73] hover:text-[#9E3B24] cursor-pointer"
                  >
                    Clear Bill
                  </button>
                )}
                <span className="text-xs font-mono text-[#777A73]">
                  {cart.length} {cart.length === 1 ? 'Item' : 'Items'}
                </span>
              </div>
            </div>

            {posError && (
              <div
                role="alert"
                className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-xs text-[#9E3B24]"
              >
                {posError}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#252923]">
                  Trade Customer / Account
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setQcError('');
                    setQcCompany('');
                    setQcName('');
                    setQcEmail('');
                    setQuickCustOpen(true);
                  }}
                  className="text-[11px] font-medium text-[#315744] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>+ New Customer</span>
                </button>
              </div>
              <Select
                aria-label="Trade Customer / Account"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                options={customerOptions}
              />
            </div>

            {/* Cart Line Items */}
            <div className="border border-[#E7E4DC] divide-y divide-[#E7E4DC] max-h-64 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#777A73]">
                  No materials in the current bill. Click "Add" on any product on the
                  left to start billing.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.productId}
                    className="p-3 flex items-center justify-between gap-3 bg-[#F7F6F2]/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[#252923] truncate">
                        {item.productName}
                      </div>
                      <div className="text-[11px] font-mono text-[#777A73]">
                        {formatCurrency(item.unitPrice, settings.currencySymbol)} /{' '}
                        {item.unit} · Max: {item.availableStock}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${item.productName}`}
                        onClick={() =>
                          updateCartQuantity(item.productId, item.quantity - 1)
                        }
                        className="p-1 bg-[#FFFFFF] border border-[#E7E4DC] hover:bg-[#EFEEE8] cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        aria-label={`Quantity for ${item.productName}`}
                        min="1"
                        max={item.availableStock}
                        value={item.quantity}
                        onChange={(e) =>
                          updateCartQuantity(
                            item.productId,
                            parseInt(e.target.value, 10) || 1
                          )
                        }
                        className="w-14 text-center py-1 text-xs font-mono tabular-nums bg-[#FFFFFF] border border-[#E7E4DC]"
                      />
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${item.productName}`}
                        onClick={() =>
                          updateCartQuantity(item.productId, item.quantity + 1)
                        }
                        className="p-1 bg-[#FFFFFF] border border-[#E7E4DC] hover:bg-[#EFEEE8] cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${item.productName} from bill`}
                        onClick={() => updateCartQuantity(item.productId, 0)}
                        className="p-1 text-[#777A73] hover:text-[#9E3B24] cursor-pointer ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="w-24 text-right font-mono tabular-nums text-xs font-semibold text-[#252923] shrink-0">
                      {formatCurrency(item.lineTotal, settings.currencySymbol)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label={`Discount (${settings.currencySymbol})`}
                type="number"
                min="0"
                step="1"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
              />
              <Input
                label="GST / Tax Rate (%)"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={taxRateInput}
                onChange={(e) => setTaxRateInput(e.target.value)}
              />
              <Select
                label="Payment Status"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                options={[
                  { value: 'Paid', label: 'Paid in Full' },
                  { value: 'Pending', label: 'Pending (Credit)' },
                  { value: 'Partial', label: 'Partial Payment' },
                ]}
              />
            </div>

            {paymentStatus === 'Partial' && (
              <Input
                label={`Amount Paid Now (${settings.currencySymbol})`}
                type="number"
                min="0"
                max={totals.grandTotal}
                step="1"
                placeholder={`Out of ${formatCurrency(totals.grandTotal, settings.currencySymbol)}`}
                value={partialPaidInput}
                onChange={(e) => setPartialPaidInput(e.target.value)}
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Payment Method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                options={[
                  { value: 'Bank Transfer', label: 'Bank Transfer / NEFT' },
                  { value: 'UPI', label: 'UPI Instant Settlement' },
                  { value: 'Card', label: 'Card Terminal' },
                  { value: 'Cash', label: 'Cash' },
                  { value: 'Credit Account', label: 'Credit Account' },
                ]}
              />
              <Input
                label="Dispatch / Delivery Site Note"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Totals Breakdown */}
            <div className="p-4 bg-[#F7F6F2] border border-[#E7E4DC] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#777A73]">Subtotal ({totals.totalQuantity} units)</span>
                <span className="font-mono tabular-nums text-[#252923]">
                  {formatCurrency(totals.subtotal, settings.currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777A73]">Trade Discount</span>
                <span className="font-mono tabular-nums text-[#BD704F]">
                  -{formatCurrency(totals.discountAmount, settings.currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777A73]">
                  GST / Tax ({totals.taxRate}%)
                </span>
                <span className="font-mono tabular-nums text-[#252923]">
                  {formatCurrency(totals.taxAmount, settings.currencySymbol)}
                </span>
              </div>
              <div className="pt-2.5 border-t border-[#E7E4DC] flex justify-between text-base font-bold">
                <span className="text-[#252923]">Final Total</span>
                <span className="font-mono tabular-nums text-[#315744]">
                  {formatCurrency(totals.grandTotal, settings.currencySymbol)}
                </span>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={submitting || cart.length === 0}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Issuing Invoice...'
                  : 'Complete Sale & Generate Invoice'}
              </span>
            </Button>
          </form>
        </div>
      ) : (
        /* Screen 10: Sales History */
        <div className="bg-[#FFFFFF] border border-[#E7E4DC]">
          <div className="p-4 border-b border-[#E7E4DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-[#777A73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search sales history"
                  placeholder="Search invoice, customer, material..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#315744]"
                />
              </div>

              <select
                aria-label="Filter invoices by payment status"
                value={historyStatusFilter}
                onChange={(e) =>
                  setHistoryStatusFilter(e.target.value as 'All' | PaymentStatus)
                }
                className="px-3 py-1.5 text-xs bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:border-[#315744]"
              >
                <option value="All">All Payment Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Partial">Partial</option>
              </select>

              <select
                aria-label="Filter invoices by payment method"
                value={historyMethodFilter}
                onChange={(e) =>
                  setHistoryMethodFilter(e.target.value as 'All' | PaymentMethod)
                }
                className="px-3 py-1.5 text-xs bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:border-[#315744]"
              >
                <option value="All">All Payment Methods</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Cash">Cash</option>
                <option value="Credit Account">Credit Account</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSalesHistoryCsv}
                disabled={filteredSalesHistory.length === 0}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export to CSV ({filteredSalesHistory.length})</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setScreen('pos-billing')}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Counter Sale</span>
              </Button>
            </div>
          </div>

          {filteredSalesHistory.length === 0 ? (
            <EmptyState
              title="No sales invoices found"
              description="Complete a counter sale to generate your first customer invoice."
              actionLabel="New Sale"
              onAction={() => setScreen('pos-billing')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                    <th className="py-3 px-4">INVOICE #</th>
                    <th className="py-3 px-4">DATE</th>
                    <th className="py-3 px-4">CUSTOMER</th>
                    <th className="py-3 px-4">MATERIALS</th>
                    <th className="py-3 px-4 text-right">GRAND TOTAL</th>
                    <th className="py-3 px-4 text-right">BALANCE DUE</th>
                    <th className="py-3 px-4">STATUS</th>
                    <th className="py-3 px-4 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E4DC] text-xs">
                  {filteredSalesHistory.map((sale) => {
                    const balanceDue =
                      sale.balanceDue !== undefined
                        ? sale.balanceDue
                        : sale.paymentStatus === 'Paid'
                        ? 0
                        : sale.grandTotal;
                    return (
                      <tr key={sale.id} className="hover:bg-[#F7F6F2]/60">
                        <td className="py-3 px-4 font-mono font-semibold text-[#252923] whitespace-nowrap">
                          {sale.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#777A73] whitespace-nowrap">
                          {sale.createdAt.slice(0, 10)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#252923]">{sale.customerName}</div>
                          <div className="text-[11px] text-[#777A73]">
                            {sale.customerCompany}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#777A73]">
                          {sale.primaryProductName} ({sale.totalQuantity} units)
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#252923]">
                          {formatCurrency(sale.grandTotal, settings.currencySymbol)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#BD704F]">
                          {balanceDue > 0
                            ? formatCurrency(balanceDue, settings.currencySymbol)
                            : '—'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <StatusIndicator
                            status={sale.paymentStatus}
                            detail={sale.paymentMethod}
                          />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2.5">
                            {balanceDue > 0 && (
                              <button
                                type="button"
                                onClick={() => openPaymentModal(sale)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#BD704F] hover:underline cursor-pointer"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Pay</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInvoice(sale);
                                setScreen('invoice-detail');
                              }}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#315744] hover:underline cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const cust = customers.find((c) => c.id === sale.customerId);
                                const html = buildPrintableInvoiceHtml(sale, settings, cust);
                                triggerDocumentPrint(html);
                                setSelectedInvoice(sale);
                                setScreen('invoice-detail');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[#EDF3F0] text-[#315744] hover:bg-[#315744] hover:text-white transition-colors cursor-pointer"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Print</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quick-Add Customer Modal from POS Counter */}
      <Dialog
        open={quickCustOpen}
        onClose={() => setQuickCustOpen(false)}
        title="Register Trade Customer"
        subtitle="Add a new contractor or architectural firm and assign them directly to the active counter bill."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!qcCompany.trim() || !qcName.trim() || !qcEmail.trim()) {
              setQcError('Company name, contact name, and email are required.');
              return;
            }
            setQcSaving(true);
            try {
              await saveCustomer({
                company: qcCompany.trim(),
                name: qcName.trim(),
                phone: qcPhone.trim() || '+91 98450 11220',
                email: qcEmail.trim(),
                city: qcCity.trim() || 'Bengaluru, KA',
                gstOrTaxId: qcGstin.trim() || '29AAACB1902P1Z8',
                creditLimit: 250000,
                outstandingBalance: 0,
                tier: qcTier,
              });
              setQuickCustOpen(false);
            } catch (err) {
              setQcError(err instanceof Error ? err.message : 'Failed to create customer.');
            } finally {
              setQcSaving(false);
            }
          }}
          className="space-y-4 text-xs"
          noValidate
        >
          {qcError && (
            <div className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-[#9E3B24]">
              {qcError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Company / Studio Name"
              value={qcCompany}
              onChange={(e) => setQcCompany(e.target.value)}
              required
            />
            <Input
              label="Primary Contact Name"
              value={qcName}
              onChange={(e) => setQcName(e.target.value)}
              required
            />
            <Input
              label="Work Email"
              type="email"
              value={qcEmail}
              onChange={(e) => setQcEmail(e.target.value)}
              required
            />
            <Input
              label="Phone Number"
              value={qcPhone}
              onChange={(e) => setQcPhone(e.target.value)}
            />
            <Input
              label="GSTIN / Tax ID"
              value={qcGstin}
              onChange={(e) => setQcGstin(e.target.value)}
            />
            <Select
              label="Account Tier"
              value={qcTier}
              onChange={(e) => setQcTier(e.target.value as Customer['tier'])}
              options={[
                { value: 'Contractor', label: 'Contractor' },
                { value: 'Architectural Firm', label: 'Architectural Firm' },
                { value: 'Developer', label: 'Developer' },
                { value: 'Retail', label: 'Retail' },
              ]}
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#E7E4DC]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuickCustOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={qcSaving}>
              {qcSaving ? 'Saving...' : 'Save & Select Customer'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Record Payment Modal */}
      <Dialog
        open={Boolean(payingInvoice)}
        onClose={() => setPayingInvoice(null)}
        title={
          payingInvoice
            ? `Record Payment · ${payingInvoice.invoiceNumber}`
            : 'Record Payment'
        }
        subtitle={
          payingInvoice
            ? `Customer: ${payingInvoice.customerCompany} · Invoice Total: ${formatCurrency(
                payingInvoice.grandTotal,
                settings.currencySymbol
              )}`
            : ''
        }
      >
        {payingInvoice && (
          <form onSubmit={handleRecordPaymentSubmit} className="space-y-4 text-xs" noValidate>
            {payError && (
              <div className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-[#9E3B24]">
                {payError}
              </div>
            )}

            <Input
              label={`Settlement Amount (${settings.currencySymbol})`}
              type="number"
              min="1"
              step="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              required
            />

            <Select
              label="Payment Method"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              options={[
                { value: 'Bank Transfer', label: 'Bank Transfer / NEFT' },
                { value: 'UPI', label: 'UPI Instant Settlement' },
                { value: 'Card', label: 'Card Terminal' },
                { value: 'Cash', label: 'Cash' },
              ]}
            />

            <Input
              label="Transaction / UTR Reference"
              placeholder="e.g., NEFT-UTR-992014"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
            />

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E7E4DC]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPayingInvoice(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={recordingPay}>
                {recordingPay ? 'Recording...' : 'Confirm Payment'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
};

// Screen 9: Invoice Detail and Print View
export const InvoiceDetailScreen: React.FC = () => {
  const {
    selectedInvoice,
    setSelectedInvoice,
    sales,
    customers,
    settings,
    recordPayment,
    setScreen,
    addToast,
  } = useStore();

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Bank Transfer');
  const [payRef, setPayRef] = useState('');
  const [payError, setPayError] = useState('');
  const [savingPay, setSavingPay] = useState(false);

  // Print & Export Configuration State
  const [copyType, setCopyType] = useState<InvoiceCopyType>('ORIGINAL FOR RECIPIENT');
  const [paperFormat, setPaperFormat] = useState<PrintPaperFormat>('a4');
  const [taxSplitMode, setTaxSplitMode] = useState<'cgst_sgst' | 'igst'>('cgst_sgst');
  const [printStudioOpen, setPrintStudioOpen] = useState(false);

  const invoice = selectedInvoice
    ? sales.find((s) => s.id === selectedInvoice.id) || selectedInvoice
    : sales[0];

  if (!invoice) {
    return (
      <EmptyState
        title="No invoice selected"
        description="Complete a sale or select an existing invoice from Sales History."
        actionLabel="Create New Sale"
        onAction={() => setScreen('pos-billing')}
      />
    );
  }

  const lineItems =
    invoice.items ||
    parseCartItemsSummary(invoice.itemsSummary, {
      id: invoice.primaryProductId,
      name: invoice.primaryProductName,
      totalQuantity: invoice.totalQuantity,
      subtotal: invoice.subtotal,
    });

  const customerRecord = customers.find((c) => c.id === invoice.customerId);
  const amountPaid =
    invoice.amountPaid !== undefined
      ? invoice.amountPaid
      : invoice.paymentStatus === 'Paid'
      ? invoice.grandTotal
      : 0;
  const balanceDue =
    invoice.balanceDue !== undefined
      ? invoice.balanceDue
      : Math.max(0, invoice.grandTotal - amountPaid);

  const halfTaxRate = Number((invoice.taxRate / 2).toFixed(2));
  const halfTaxAmount = Number((invoice.taxAmount / 2).toFixed(2));
  const amountInWords = numberToIndianWords(
    invoice.grandTotal,
    settings.currencySymbol
  );

  const printableHtml = buildPrintableInvoiceHtml(
    invoice,
    settings,
    customerRecord,
    {
      copyType,
      paperFormat,
      taxSplitMode,
    }
  );

  const handlePrintInvoice = () => {
    triggerDocumentPrint(printableHtml);
    setPrintStudioOpen(true);
    addToast(
      `Prepared ${invoice.invoiceNumber} for printing`,
      'System print dialog triggered. You can also download the standalone printable document below.',
      'success'
    );
  };

  const handleDownloadPrintableInvoice = () => {
    const slug = invoice.invoiceNumber.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    downloadPrintableHtml(
      printableHtml,
      `${slug}_${copyType.toLowerCase().replace(/\s+/g, '_')}.html`
    );
    addToast(
      'Printable invoice downloaded',
      `Downloaded ${invoice.invoiceNumber} (${copyType}) as a print-ready document.`,
      'success'
    );
  };

  const handleExportSingleInvoiceCsv = () => {
    exportSingleInvoiceToCsv(invoice);
    addToast(
      'Invoice CSV exported',
      `Exported ${lineItems.length} line items for ${invoice.invoiceNumber}.`,
      'success'
    );
  };

  const handleOpenPay = () => {
    setPayAmount(String(balanceDue));
    setPayMethod('Bank Transfer');
    setPayRef(`UTR-${Date.now().toString().slice(-6)}`);
    setPayError('');
    setPayModalOpen(true);
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError('');
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setPayError('Enter a valid positive amount.');
      return;
    }
    setSavingPay(true);
    try {
      await recordPayment({
        invoiceId: invoice.id,
        amount: amt,
        method: payMethod,
        reference: payRef,
      });
      setPayModalOpen(false);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setSavingPay(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Action Bar (Hidden when printing) */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E7E4DC] no-print">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScreen('sales-history')}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Sales History</span>
          </Button>

          <select
            aria-label="Select invoice to inspect"
            value={invoice.id}
            onChange={(e) => {
              const found = sales.find((s) => s.id === e.target.value);
              if (found) setSelectedInvoice(found);
            }}
            className="px-3 py-1.5 text-xs font-mono bg-[#FFFFFF] border border-[#E7E4DC] text-[#252923]"
          >
            {sales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.invoiceNumber} — {s.customerCompany} (
                {formatCurrency(s.grandTotal, settings.currencySymbol)})
              </option>
            ))}
          </select>

          <select
            aria-label="Select invoice copy type"
            value={copyType}
            onChange={(e) => setCopyType(e.target.value as InvoiceCopyType)}
            className="px-2.5 py-1.5 text-xs font-mono bg-[#F7F6F2] border border-[#E7E4DC] text-[#252923]"
          >
            <option value="ORIGINAL FOR RECIPIENT">Original for Recipient</option>
            <option value="DUPLICATE FOR TRANSPORTER">Duplicate for Transporter</option>
            <option value="TRIPLICATE FOR SUPPLIER">Triplicate for Supplier</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {balanceDue > 0 && (
            <Button variant="secondary" size="sm" onClick={handleOpenPay}>
              <CreditCard className="w-3.5 h-3.5" />
              <span>Record Payment ({formatCurrency(balanceDue, settings.currencySymbol)})</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportSingleInvoiceCsv}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadPrintableInvoice}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Printable</span>
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handlePrintInvoice}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Invoice</span>
          </Button>
        </div>
      </div>

      {/* Print-Friendly Architectural Tax Invoice Document */}
      <article
        id="printable-invoice-sheet"
        className={`bg-[#FFFFFF] border border-[#E7E4DC] p-8 sm:p-12 print-only-container space-y-8 mx-auto ${
          paperFormat === 'thermal80' ? 'max-w-sm' : ''
        }`}
      >
        {/* Invoice Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-8 border-b-2 border-[#252923]">
          <div>
            <div className="text-xl font-bold text-[#252923] font-display tracking-tight">
              {settings.businessName}
            </div>
            <div className="text-xs text-[#777A73] mt-1">{settings.legalName}</div>
            <div className="text-xs text-[#777A73] mt-0.5">
              {settings.warehouseAddress}
            </div>
            <div className="text-xs font-mono text-[#777A73] mt-1">
              GSTIN / Tax Reg: <strong className="text-[#252923]">{settings.taxRegistrationNumber}</strong> · {settings.contactPhone}
            </div>
          </div>

          <div className="sm:text-right">
            <div className="inline-block px-2 py-0.5 text-[10px] font-mono font-semibold bg-[#F7F6F2] border border-[#E7E4DC] text-[#315744] mb-1.5">
              {copyType}
            </div>
            <div className="text-xs font-mono uppercase tracking-wider text-[#315744]">
              TAX INVOICE & DISPATCH NOTE
            </div>
            <div className="text-2xl font-bold font-mono text-[#252923] mt-1">
              {invoice.invoiceNumber}
            </div>
            <div className="text-xs font-mono text-[#777A73] mt-1">
              Issued: {invoice.createdAt.slice(0, 10)}
            </div>
            <div className="mt-2 sm:inline-block">
              <StatusIndicator
                status={invoice.paymentStatus}
                detail={invoice.paymentMethod}
              />
            </div>
          </div>
        </div>

        {/* Bill To & Dispatch Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-6 border-b border-[#E7E4DC] text-xs">
          <div>
            <div className="font-mono text-[11px] text-[#777A73] mb-1">
              BILLED TO CONTRACTOR / TRADE ACCOUNT
            </div>
            <div className="text-sm font-semibold text-[#252923]">
              {invoice.customerCompany}
            </div>
            <div className="text-[#252923] mt-0.5">Attn: {invoice.customerName}</div>
            {customerRecord && (
              <>
                <div className="text-[#777A73] mt-0.5">
                  {customerRecord.city} · {customerRecord.phone}
                </div>
                <div className="font-mono text-[#777A73] mt-0.5">
                  GSTIN / Tax ID: {customerRecord.gstOrTaxId}
                </div>
              </>
            )}
          </div>

          <div className="sm:text-right">
            <div className="font-mono text-[11px] text-[#777A73] mb-1">
              SETTLEMENT & DISPATCH TERMS
            </div>
            <div className="text-[#252923]">
              Payment Method: <span className="font-medium">{invoice.paymentMethod}</span>
            </div>
            <div className="text-[#777A73] mt-1">
              Dispatch Notes: {invoice.notes || 'Standard yard dispatch'}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#252923] text-[11px] font-mono text-[#777A73]">
                <th className="py-2.5 pr-4">#</th>
                <th className="py-2.5 px-4">MATERIAL DESCRIPTION</th>
                <th className="py-2.5 px-4">SKU</th>
                <th className="py-2.5 px-4">UNIT</th>
                <th className="py-2.5 px-4 text-right">QTY</th>
                <th className="py-2.5 px-4 text-right">UNIT PRICE</th>
                <th className="py-2.5 pl-4 text-right">LINE TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E4DC] text-xs">
              {lineItems.map((item, idx) => (
                <tr key={`${item.productId}_${idx}`}>
                  <td className="py-3.5 pr-4 font-mono text-[#777A73]">
                    {String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-[#252923]">
                    {item.productName}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#777A73]">{item.sku}</td>
                  <td className="py-3.5 px-4 text-[#777A73]">{item.unit}</td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#252923]">
                    {item.quantity}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#777A73]">
                    {formatCurrency(item.unitPrice, settings.currencySymbol)}
                  </td>
                  <td className="py-3.5 pl-4 text-right font-mono tabular-nums font-semibold text-[#252923]">
                    {formatCurrency(item.lineTotal, settings.currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Amount in Words Banner */}
        <div className="p-3.5 bg-[#F7F6F2] border border-[#E7E4DC] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#777A73] mr-2">
              AMOUNT IN WORDS:
            </span>
            <span className="font-semibold text-[#252923]">{amountInWords}</span>
          </div>
          <span className="font-mono text-[#777A73]">
            Total Units: {invoice.totalQuantity}
          </span>
        </div>

        {/* Invoice Totals Summary */}
        <div className="pt-6 border-t border-[#252923] flex flex-col sm:flex-row justify-between gap-8">
          <div className="text-xs text-[#777A73] max-w-sm space-y-2">
            <div className="font-semibold text-[#252923]">
              Material Quality & Receiving Certification
            </div>
            <p>
              All structural materials conform to stated IS / EN / BS architectural grade
              specifications. Goods inspected and released from{' '}
              {settings.warehouseAddress}.
            </p>
            <div className="pt-2 font-mono text-[11px] text-[#252923]">
              Settlement Account: {settings.legalName} · GSTIN: {settings.taxRegistrationNumber}
            </div>
          </div>

          <div className="w-full sm:w-80 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#777A73]">Taxable Subtotal</span>
              <span className="font-mono tabular-nums text-[#252923]">
                {formatCurrency(invoice.subtotal, settings.currencySymbol)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777A73]">Trade Discount</span>
              <span className="font-mono tabular-nums text-[#BD704F]">
                -{formatCurrency(invoice.discountAmount, settings.currencySymbol)}
              </span>
            </div>
            {taxSplitMode === 'cgst_sgst' ? (
              <>
                <div className="flex justify-between">
                  <span className="text-[#777A73]">CGST ({halfTaxRate}%)</span>
                  <span className="font-mono tabular-nums text-[#252923]">
                    {formatCurrency(halfTaxAmount, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#777A73]">SGST ({halfTaxRate}%)</span>
                  <span className="font-mono tabular-nums text-[#252923]">
                    {formatCurrency(
                      Number((invoice.taxAmount - halfTaxAmount).toFixed(2)),
                      settings.currencySymbol
                    )}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-[#777A73]">IGST / Tax ({invoice.taxRate}%)</span>
                <span className="font-mono tabular-nums text-[#252923]">
                  {formatCurrency(invoice.taxAmount, settings.currencySymbol)}
                </span>
              </div>
            )}
            <div className="pt-3 border-t border-[#E7E4DC] flex justify-between text-base font-bold">
              <span className="text-[#252923]">Invoice Total</span>
              <span className="font-mono tabular-nums text-[#315744]">
                {formatCurrency(invoice.grandTotal, settings.currencySymbol)}
              </span>
            </div>
            <div className="flex justify-between pt-1 text-[#777A73]">
              <span>Amount Paid</span>
              <span className="font-mono tabular-nums text-[#252923]">
                {formatCurrency(amountPaid, settings.currencySymbol)}
              </span>
            </div>
            {balanceDue > 0 && (
              <div className="flex justify-between font-semibold text-[#BD704F]">
                <span>Balance Due</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(balanceDue, settings.currencySymbol)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Signatory Footer */}
        <div className="pt-6 border-t border-dashed border-[#E7E4DC] flex flex-col sm:flex-row sm:items-end justify-between gap-4 text-xs text-[#777A73]">
          <div>
            <div>Receiver's Signature & Site Stamp</div>
            <div className="text-[11px] mt-0.5">
              Received materials in good structural condition.
            </div>
          </div>
          <div className="sm:text-right">
            <div className="font-semibold text-[#252923]">
              For {settings.businessName}
            </div>
            <div className="text-[11px] mt-4">Authorized Yard Signatory</div>
          </div>
        </div>
      </article>

      {/* Print & Document Export Studio Modal */}
      <Dialog
        open={printStudioOpen}
        onClose={() => setPrintStudioOpen(false)}
        title={`Print & Export Studio · ${invoice.invoiceNumber}`}
        subtitle="Configure paper size, recipient copy header, and GST tax split, then print or download the standalone invoice."
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-[#F7F6F2] border border-[#E7E4DC]">
            <Select
              label="Invoice Copy Header"
              value={copyType}
              onChange={(e) => setCopyType(e.target.value as InvoiceCopyType)}
              options={[
                { value: 'ORIGINAL FOR RECIPIENT', label: 'Original for Recipient' },
                { value: 'DUPLICATE FOR TRANSPORTER', label: 'Duplicate for Transporter' },
                { value: 'TRIPLICATE FOR SUPPLIER', label: 'Triplicate for Supplier' },
              ]}
            />
            <Select
              label="Paper Format"
              value={paperFormat}
              onChange={(e) => setPaperFormat(e.target.value as PrintPaperFormat)}
              options={[
                { value: 'a4', label: 'A4 Standard Sheet' },
                { value: 'thermal80', label: '80mm Thermal Counter Receipt' },
              ]}
            />
            <Select
              label="GST Tax Display"
              value={taxSplitMode}
              onChange={(e) =>
                setTaxSplitMode(e.target.value as 'cgst_sgst' | 'igst')
              }
              options={[
                { value: 'cgst_sgst', label: `CGST (${halfTaxRate}%) + SGST (${halfTaxRate}%)` },
                { value: 'igst', label: `Integrated IGST (${invoice.taxRate}%)` },
              ]}
            />
          </div>

          <div className="p-4 bg-[#FFFFFF] border border-[#E7E4DC] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-[#315744]">
                READY TO PRINT OR DOWNLOAD
              </span>
              <span className="font-mono font-semibold text-[#252923]">
                {invoice.invoiceNumber} · {formatCurrency(invoice.grandTotal, settings.currencySymbol)}
              </span>
            </div>
            <p className="text-[#777A73]">
              Amount in Words: <strong className="text-[#252923]">{amountInWords}</strong>
            </p>
            <p className="text-[11px] text-[#777A73]">
              If your browser preview environment restricts modal print popups, click{' '}
              <strong>Download Printable Invoice (.html)</strong> to save the self-contained
              A4 tax invoice document directly to your computer.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E7E4DC]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportSingleInvoiceCsv}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Line Items CSV</span>
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadPrintableInvoice}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Printable Invoice (.html)</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => triggerDocumentPrint(printableHtml)}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Send to System Printer</span>
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={`Record Payment · ${invoice.invoiceNumber}`}
        subtitle={`Balance Due: ${formatCurrency(balanceDue, settings.currencySymbol)}`}
      >
        <form onSubmit={handlePaySubmit} className="space-y-4 text-xs" noValidate>
          {payError && (
            <div className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-[#9E3B24]">
              {payError}
            </div>
          )}
          <Input
            label={`Payment Amount (${settings.currencySymbol})`}
            type="number"
            min="1"
            step="0.01"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            required
          />
          <Select
            label="Payment Method"
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
            options={[
              { value: 'Bank Transfer', label: 'Bank Transfer / NEFT' },
              { value: 'UPI', label: 'UPI Instant Settlement' },
              { value: 'Card', label: 'Card Terminal' },
              { value: 'Cash', label: 'Cash' },
            ]}
          />
          <Input
            label="UTR / Reference Number"
            value={payRef}
            onChange={(e) => setPayRef(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPayModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingPay}>
              {savingPay ? 'Recording...' : 'Confirm Payment'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

