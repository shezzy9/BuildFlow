import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  ArrowUpDown,
  Edit3,
  Trash2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Download,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { MaterialCategory, Product, StockStatus } from '../../types';
import {
  formatCurrency,
  getStockStatus,
} from '../../utils/inventoryLogic';
import { exportProductsToCsv } from '../../utils/exportUtils';
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

const CATEGORIES: Array<'All' | MaterialCategory> = [
  'All',
  'Cement',
  'Steel',
  'Bricks',
  'Pipes',
  'Timber',
  'Aggregates',
];

export const ProductsCatalogueScreen: React.FC = () => {
  const {
    products,
    movements,
    settings,
    setScreen,
    setEditingProduct,
    deleteProduct,
    addToast,
    categoryFilterFromHero,
    setCategoryFilterFromHero,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    categoryFilterFromHero || 'All'
  );
  const [statusFilter, setStatusFilter] = useState<'All' | StockStatus>('All');
  const [sortBy, setSortBy] = useState<'name' | 'quantity' | 'sellingPrice'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  // Individual product detail modal & delete confirmation modal
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    if (categoryFilterFromHero && categoryFilterFromHero !== 'All') {
      setSelectedCategory(categoryFilterFromHero);
      setCategoryFilterFromHero('All');
    }
  }, [categoryFilterFromHero, setCategoryFilterFromHero]);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
      const status = getStockStatus(p.quantity, p.minStockLevel);
      const matchesStatus = statusFilter === 'All' || status === statusFilter;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q);
      return matchesCat && matchesStatus && matchesSearch;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'quantity') cmp = a.quantity - b.quantity;
      else if (sortBy === 'sellingPrice') cmp = a.sellingPrice - b.sellingPrice;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [products, searchQuery, selectedCategory, statusFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const paginatedProducts = filteredAndSorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleSort = (field: 'name' | 'quantity' | 'sellingPrice') => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setDeleteError('');
    setIsDeleting(true);
    try {
      await deleteProduct(deletingProduct.id);
      setDeletingProduct(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to delete product.';
      setDeleteError(msg);
      addToast('Cannot delete product', msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const productMovements = useMemo(() => {
    if (!viewingProduct) return [];
    return movements.filter((m) => m.productId === viewingProduct.id).slice(0, 6);
  }, [viewingProduct, movements]);

  const handleExportProductsCsv = () => {
    if (filteredAndSorted.length === 0) {
      addToast('No products to export', 'Add a product or adjust your filters to export records.', 'warning');
      return;
    }
    const dateStamp = new Date().toISOString().slice(0, 10);
    const catSlug = selectedCategory === 'All' ? 'all' : selectedCategory.toLowerCase();
    exportProductsToCsv(
      filteredAndSorted,
      `buildflow_products_${catSlug}_${dateStamp}.csv`
    );
    addToast(
      'Catalogue exported to CSV',
      `Exported ${filteredAndSorted.length} filtered material ${filteredAndSorted.length === 1 ? 'record' : 'records'} to CSV.`,
      'success'
    );
  };

  return (
    <div className="space-y-6">
      <PageHeading
        kicker="MATERIAL CATALOGUE & PRICING"
        title="Product Catalogue"
        subtitle="Manage architectural materials, SKUs, unit costs, trade selling prices, and bay assignments."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="md"
              onClick={handleExportProductsCsv}
              disabled={filteredAndSorted.length === 0}
            >
              <Download className="w-4 h-4" />
              <span>Export to CSV ({filteredAndSorted.length})</span>
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setEditingProduct(null);
                setScreen('product-form');
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </Button>
          </div>
        }
      />

      {/* Filter & Search Bar */}
      <div className="bg-[#FFFFFF] border border-[#E7E4DC] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Category Segmented Filter */}
        <div className="flex flex-wrap items-center gap-1 bg-[#F7F6F2] p-1 border border-[#E7E4DC]">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC]'
                  : 'text-[#777A73] hover:text-[#252923]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Status Filter, Search & Table CSV Export */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by stock status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'All' | StockStatus);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 text-xs bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:border-[#315744]"
          >
            <option value="All">All Stock Statuses</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out of Stock">Out of Stock</option>
          </select>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[#777A73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search catalogue by material name or SKU"
              placeholder="Search name, SKU, bay..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#315744]"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportProductsCsv}
            disabled={filteredAndSorted.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export to CSV</span>
          </Button>
        </div>
      </div>

      {/* Catalogue Table */}
      {filteredAndSorted.length === 0 ? (
        <EmptyState
          title="No materials match your filter"
          description="Try clearing the search query or add a new building material to your catalogue."
          actionLabel="Add Product"
          onAction={() => {
            setEditingProduct(null);
            setScreen('product-form');
          }}
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E7E4DC]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                  <th className="py-3 px-4">SPECIMEN</th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-[#252923] cursor-pointer"
                    >
                      <span>MATERIAL NAME</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">CATEGORY</th>
                  <th className="py-3 px-4">UNIT</th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('quantity')}
                      className="inline-flex items-center gap-1 hover:text-[#252923] cursor-pointer"
                    >
                      <span>AVAILABLE QTY</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">PURCHASE PRICE</th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('sellingPrice')}
                      className="inline-flex items-center gap-1 hover:text-[#252923] cursor-pointer"
                    >
                      <span>SELLING PRICE</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">STOCK STATUS</th>
                  <th className="py-3 px-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E4DC] text-xs">
                {paginatedProducts.map((product) => {
                  const status = getStockStatus(product.quantity, product.minStockLevel);
                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-[#F7F6F2]/60 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <MaterialSpecimenThumb category={product.category} size="sm" />
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setViewingProduct(product)}
                          className="font-semibold text-[#252923] hover:text-[#315744] text-left cursor-pointer"
                        >
                          {product.name}
                        </button>
                        <div className="text-[11px] text-[#777A73] mt-0.5">
                          {product.location} · {product.supplierName}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#777A73] whitespace-nowrap">
                        {product.sku}
                      </td>
                      <td className="py-3 px-4 text-[#252923] whitespace-nowrap">
                        {product.category}
                      </td>
                      <td className="py-3 px-4 text-[#777A73] whitespace-nowrap">
                        {product.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#252923] whitespace-nowrap">
                        {product.quantity}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#777A73] whitespace-nowrap">
                        {formatCurrency(product.purchasePrice, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#252923] whitespace-nowrap">
                        {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusIndicator
                          status={status}
                          detail={`Min ${product.minStockLevel}`}
                        />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingProduct(product)}
                            aria-label={`Inspect ${product.name}`}
                            className="p-1.5 text-[#777A73] hover:text-[#315744] hover:bg-[#EFEEE8] transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(product);
                              setScreen('product-form');
                            }}
                            aria-label={`Edit ${product.name}`}
                            className="p-1.5 text-[#777A73] hover:text-[#252923] hover:bg-[#EFEEE8] transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError('');
                              setDeletingProduct(product);
                            }}
                            aria-label={`Delete ${product.name}`}
                            className="p-1.5 text-[#777A73] hover:text-[#9E3B24] hover:bg-[#FDF3F1] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-4 py-3 border-t border-[#E7E4DC] bg-[#F7F6F2]/50 flex items-center justify-between text-xs text-[#777A73]">
            <div>
              Showing <span className="font-mono font-medium text-[#252923]">{paginatedProducts.length}</span> of{' '}
              <span className="font-mono font-medium text-[#252923]">{filteredAndSorted.length}</span> materials
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
                className="px-2.5 py-1 bg-[#FFFFFF] border border-[#E7E4DC] disabled:opacity-40 hover:bg-[#EFEEE8] cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono">
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
                className="px-2.5 py-1 bg-[#FFFFFF] border border-[#E7E4DC] disabled:opacity-40 hover:bg-[#EFEEE8] cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Individual Product Detail Dialog */}
      <Dialog
        open={Boolean(viewingProduct)}
        onClose={() => setViewingProduct(null)}
        title={viewingProduct?.name || 'Product Specification'}
        subtitle={
          viewingProduct
            ? `SKU: ${viewingProduct.sku} · Category: ${viewingProduct.category}`
            : ''
        }
      >
        {viewingProduct && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-4 pb-3 border-b border-[#E7E4DC]">
              <MaterialSpecimenThumb category={viewingProduct.category} size="md" />
              <div>
                <div className="font-semibold text-sm text-[#252923]">
                  {viewingProduct.name}
                </div>
                <div className="text-[#777A73] mt-0.5">
                  Supplier: {viewingProduct.supplierName} · Bay: {viewingProduct.location}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-[#F7F6F2] p-3.5 border border-[#E7E4DC]">
              <div>
                <div className="text-[#777A73]">Available Stock</div>
                <div className="font-mono font-semibold text-sm text-[#252923] mt-0.5">
                  {viewingProduct.quantity} {viewingProduct.unit}
                </div>
              </div>
              <div>
                <div className="text-[#777A73]">Reorder Alert Threshold</div>
                <div className="font-mono font-semibold text-sm text-[#BD704F] mt-0.5">
                  {viewingProduct.minStockLevel} {viewingProduct.unit}
                </div>
              </div>
              <div>
                <div className="text-[#777A73]">Purchase Cost</div>
                <div className="font-mono font-medium text-[#252923] mt-0.5">
                  {formatCurrency(viewingProduct.purchasePrice, settings.currencySymbol)}
                </div>
              </div>
              <div>
                <div className="text-[#777A73]">Selling Price</div>
                <div className="font-mono font-semibold text-[#315744] mt-0.5">
                  {formatCurrency(viewingProduct.sellingPrice, settings.currencySymbol)}
                </div>
              </div>
            </div>

            <div>
              <div className="font-mono text-[11px] text-[#777A73] uppercase mb-1">
                Technical Specification
              </div>
              <p className="text-[#252923] leading-relaxed">
                {viewingProduct.specification}
              </p>
              {viewingProduct.description && (
                <p className="text-[#777A73] mt-1.5 leading-relaxed">
                  {viewingProduct.description}
                </p>
              )}
            </div>

            {productMovements.length > 0 && (
              <div>
                <div className="font-mono text-[11px] text-[#777A73] uppercase mb-1.5">
                  Recent Stock Ledger Activity
                </div>
                <div className="border border-[#E7E4DC] divide-y divide-[#E7E4DC]">
                  {productMovements.map((m) => (
                    <div
                      key={m.id}
                      className="px-3 py-2 flex items-center justify-between text-[11px]"
                    >
                      <div>
                        <span className="font-mono font-medium text-[#252923]">
                          {m.referenceNumber}
                        </span>
                        <span className="text-[#777A73] ml-2">{m.reason}</span>
                      </div>
                      <span
                        className={`font-mono font-semibold ${
                          m.quantityDelta >= 0 ? 'text-[#315744]' : 'text-[#BD704F]'
                        }`}
                      >
                        {m.quantityDelta >= 0 ? `+${m.quantityDelta}` : m.quantityDelta} (→{' '}
                        {m.newStock})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E7E4DC]">
              <Button variant="outline" onClick={() => setViewingProduct(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const target = viewingProduct;
                  setViewingProduct(null);
                  setEditingProduct(target);
                  setScreen('product-form');
                }}
              >
                Edit Material
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Delete Product Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
        title="Confirm Material Deletion"
        subtitle="Products referenced by existing purchase orders or sales invoices are protected from deletion."
      >
        {deletingProduct && (
          <div className="space-y-4 text-xs">
            {deleteError && (
              <div className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-[#9E3B24]">
                {deleteError}
              </div>
            )}
            <p className="text-[#252923] leading-relaxed">
              Are you sure you want to permanently remove{' '}
              <span className="font-semibold">{deletingProduct.name}</span> (
              <span className="font-mono">{deletingProduct.sku}</span>) from the catalogue?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeletingProduct(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Product'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

// Screen 4: Add and Edit Product Screen
export const ProductFormScreen: React.FC = () => {
  const {
    editingProduct,
    setEditingProduct,
    suppliers,
    saveSupplier,
    saveProduct,
    setScreen,
    settings,
  } = useStore();

  const [name, setName] = useState(editingProduct?.name || '');
  const [sku, setSku] = useState(editingProduct?.sku || '');
  const [category, setCategory] = useState<MaterialCategory>(
    editingProduct?.category || 'Cement'
  );
  const [unit, setUnit] = useState(editingProduct?.unit || 'Bag (50kg)');
  const [quantity, setQuantity] = useState(
    editingProduct ? String(editingProduct.quantity) : '100'
  );
  const [minStockLevel, setMinStockLevel] = useState(
    editingProduct ? String(editingProduct.minStockLevel) : '25'
  );
  const [purchasePrice, setPurchasePrice] = useState(
    editingProduct ? String(editingProduct.purchasePrice) : ''
  );
  const [sellingPrice, setSellingPrice] = useState(
    editingProduct ? String(editingProduct.sellingPrice) : ''
  );
  const [supplierId, setSupplierId] = useState(
    editingProduct?.supplierId || suppliers[0]?.id || 'custom_supplier'
  );
  const [customSupplierName, setCustomSupplierName] = useState(
    editingProduct?.supplierName || ''
  );
  const [location, setLocation] = useState(
    editingProduct?.location || 'Silo Bay A-02'
  );
  const [specification, setSpecification] = useState(
    editingProduct?.specification || ''
  );
  const [description, setDescription] = useState(
    editingProduct?.description || ''
  );
  const [imageUrl, setImageUrl] = useState(editingProduct?.imageUrl || '');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Material name is required.');
      return;
    }
    if (!sku.trim()) {
      setFormError('Material SKU code is required.');
      return;
    }
    const pPrice = parseFloat(purchasePrice);
    const sPrice = parseFloat(sellingPrice);
    if (isNaN(pPrice) || pPrice <= 0) {
      setFormError('Please enter a valid purchase price greater than zero.');
      return;
    }
    if (isNaN(sPrice) || sPrice <= 0) {
      setFormError('Please enter a valid selling price greater than zero.');
      return;
    }

    const chosenSupplier = suppliers.find((s) => s.id === supplierId);
    const resolvedSupplierName =
      chosenSupplier?.name || customSupplierName.trim() || 'Direct Mill Supply';

    setSaving(true);
    try {
      let resolvedSupplierId = chosenSupplier?.id || supplierId;
      if (!chosenSupplier && customSupplierName.trim()) {
        await saveSupplier({
          name: customSupplierName.trim(),
          code: `SUP-${Date.now().toString().slice(-4)}`,
          contactPerson: 'Supply Desk',
          phone: settings.contactPhone || '+91 80 4120 9900',
          email: `orders@${customSupplierName.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
          city: 'Bengaluru, KA',
          gstin: '29AAACB8921F1Z5',
          category,
          leadTimeDays: 3,
          rating: 4.8,
          status: 'Active',
        });
        resolvedSupplierId = `sup_${Date.now().toString(36)}`;
      }

      await saveProduct({
        id: editingProduct?.id,
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        category,
        unit: unit.trim() || 'Unit',
        quantity: Math.max(0, parseFloat(quantity) || 0),
        minStockLevel: Math.max(0, parseFloat(minStockLevel) || 0),
        purchasePrice: pPrice,
        sellingPrice: sPrice,
        supplierId: resolvedSupplierId,
        supplierName: resolvedSupplierName,
        location: location.trim() || 'Main Yard Bay A',
        specification:
          specification.trim() || 'Architectural & structural supply specification',
        description: description.trim(),
        imageUrl: imageUrl.trim(),
      });
      setEditingProduct(null);
      setScreen('products');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save material.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeading
        kicker={editingProduct ? `EDITING SKU · ${editingProduct.sku}` : 'NEW CATALOGUE ENTRY'}
        title={editingProduct ? 'Edit Building Material' : 'Add Building Material'}
        subtitle="Specify unit dimensions, supplier source, pricing margins, and minimum stock alert threshold."
        actions={
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              setEditingProduct(null);
              setScreen('products');
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Catalogue</span>
          </Button>
        }
      />

      <form
        onSubmit={handleSubmit}
        className="bg-[#FFFFFF] border border-[#E7E4DC] p-6 sm:p-8 space-y-6"
        noValidate
      >
        {formError && (
          <div
            role="alert"
            className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-xs text-[#9E3B24]"
          >
            {formError}
          </div>
        )}

        <div className="flex items-center gap-4 pb-5 border-b border-[#E7E4DC]">
          <MaterialSpecimenThumb category={category} size="md" />
          <div>
            <div className="text-xs font-mono text-[#777A73]">SPECIMEN THUMBNAIL</div>
            <div className="text-sm font-semibold text-[#252923]">
              {name || 'New Architectural Material'}
            </div>
            <div className="text-xs text-[#777A73]">
              Category: {category} · Unit: {unit}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input
            label="Material Name"
            placeholder="e.g., Architectural White Cement 50kg"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="SKU Code"
            placeholder="e.g., CEM-WHT-50KG"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
          />

          <Select
            label="Material Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as MaterialCategory)}
            options={[
              { value: 'Cement', label: 'Cement' },
              { value: 'Steel', label: 'Steel' },
              { value: 'Bricks', label: 'Bricks' },
              { value: 'Pipes', label: 'Pipes' },
              { value: 'Timber', label: 'Timber' },
              { value: 'Aggregates', label: 'Aggregates' },
            ]}
          />

          <Select
            label="Unit of Measure"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            options={[
              { value: 'Bag (50kg)', label: 'Bag (50kg)' },
              { value: 'Bag (25kg)', label: 'Bag (25kg)' },
              { value: 'Ton', label: 'Metric Ton' },
              { value: 'Pallet (500 pcs)', label: 'Pallet (500 pcs)' },
              { value: 'Pallet (90 pcs)', label: 'Pallet (90 pcs)' },
              { value: 'Length (6m)', label: 'Length (6m)' },
              { value: 'Length (4.8m)', label: 'Length (4.8m)' },
              { value: 'Bundle', label: 'Bundle' },
              { value: 'Piece', label: 'Piece' },
            ]}
          />

          <Input
            label={`Purchase Price (${settings.currencySymbol})`}
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            required
          />

          <Input
            label={`Selling Price (${settings.currencySymbol})`}
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={sellingPrice}
            onChange={(e) => setSellingPrice(e.target.value)}
            required
          />

          <Input
            label="Available Stock Quantity"
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />

          <Input
            label="Low-Stock Warning Threshold"
            type="number"
            min="0"
            value={minStockLevel}
            onChange={(e) => setMinStockLevel(e.target.value)}
            required
          />

          {suppliers.length > 0 ? (
            <Select
              label="Primary Supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              options={[
                ...suppliers.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.code})`,
                })),
                { value: 'custom_supplier', label: '+ Enter New Supplier / Mill Name' },
              ]}
            />
          ) : (
            <Input
              label="Supplier / Mill Name"
              placeholder="e.g., UltraTech Structural Materials"
              value={customSupplierName}
              onChange={(e) => setCustomSupplierName(e.target.value)}
            />
          )}

          {suppliers.length > 0 && supplierId === 'custom_supplier' ? (
            <Input
              label="New Supplier / Mill Name"
              placeholder="e.g., UltraTech Structural Materials"
              value={customSupplierName}
              onChange={(e) => setCustomSupplierName(e.target.value)}
            />
          ) : (
            <Input
              label="Warehouse / Yard Bay Location"
              placeholder="e.g., Silo Bay A-02"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          )}
        </div>

        {suppliers.length > 0 && supplierId === 'custom_supplier' && (
          <Input
            label="Warehouse / Yard Bay Location"
            placeholder="e.g., Silo Bay A-02"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        )}

        <Input
          label="Technical Specification / Grade Notes"
          placeholder="e.g., EN 197-1 CEM I 52.5N structural specification"
          value={specification}
          onChange={(e) => setSpecification(e.target.value)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input
            label="Handling & Packaging Description (Optional)"
            placeholder="e.g., Palletized with weather-resistant shrink wrap"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            label="Reference Image URL (Optional)"
            placeholder="https://..."
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        </div>

        <div className="pt-4 border-t border-[#E7E4DC] flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditingProduct(null);
              setScreen('products');
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving
              ? 'Saving...'
              : editingProduct
              ? 'Save Changes'
              : 'Save Material to Catalogue'}
          </Button>
        </div>
      </form>
    </div>
  );
};
