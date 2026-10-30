import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  Layers,
  Truck,
  FileSpreadsheet,
  Search,
  RefreshCw,
  Plus,
  Minus,
  Trash2,
  Download,
  Eye,
  Calculator,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { MaterialShowroom3D } from '../three/MaterialShowroom3D';
import { MaterialSpecimenThumb } from '../ui/MaterialSpecimenThumb';
import { Button, Dialog, StatusIndicator } from '../ui/Primitives';
import {
  getStockStatus,
  computeDashboardMetrics,
  formatCurrency,
  formatNumberIN,
} from '../../utils/inventoryLogic';
import { escapeCsvCell, downloadCsvFile, exportToCsv } from '../../utils/exportUtils';
import { MaterialCategory, Product } from '../../types';

const HERO_CATEGORIES: Array<{
  name: MaterialCategory;
  spec: string;
  unitSummary: string;
}> = [
  {
    name: 'Cement',
    spec: 'Portland CEM I 52.5N & Fair-Faced White Binders',
    unitSummary: '50kg & 25kg Multi-Wall Kraft Bags',
  },
  {
    name: 'Steel',
    spec: 'BS 4449 Grade B500B Ribbed Rebar & Structural Mesh',
    unitSummary: 'Metric Tons & 12m Bundles',
  },
  {
    name: 'Bricks',
    spec: 'Kilned Wirecut Terracotta & Perforated Facing Masonry',
    unitSummary: 'Strapped Pallets (500 pcs)',
  },
  {
    name: 'Pipes',
    spec: 'Schedule-80 UPVC Underground Conduit & EPDM Sockets',
    unitSummary: '6m Calibrated Lengths',
  },
  {
    name: 'Timber',
    spec: 'Kiln-Dried Strength-Graded C24 Structural Douglas Fir',
    unitSummary: '4.8m Regularized Joists',
  },
];

interface EstimateLineItem {
  product: Product;
  quantity: number;
}

type CivilProjectType = 'rcc-frame' | 'masonry-shell' | 'warehouse-slab';

const CIVIL_PROJECT_PROFILES: Record<
  CivilProjectType,
  {
    label: string;
    subtitle: string;
    cementBagsPerSqFt: number;
    steelKgPerSqFt: number;
    bricksPerSqFt: number;
    pipesLengthsPer1000SqFt: number;
    timberJoistsPer1000SqFt: number;
  }
> = {
  'rcc-frame': {
    label: 'Multi-Storey RCC Structural Frame',
    subtitle: 'Columns, beams, 150mm suspended slab & foundation footings',
    cementBagsPerSqFt: 0.42,
    steelKgPerSqFt: 4.2,
    bricksPerSqFt: 8.5,
    pipesLengthsPer1000SqFt: 18,
    timberJoistsPer1000SqFt: 24,
  },
  'masonry-shell': {
    label: 'Architectural Brickwork & Masonry Envelope',
    subtitle: 'Double-wythe wirecut clay masonry, lintels & internal partitions',
    cementBagsPerSqFt: 0.28,
    steelKgPerSqFt: 1.8,
    bricksPerSqFt: 14.0,
    pipesLengthsPer1000SqFt: 14,
    timberJoistsPer1000SqFt: 16,
  },
  'warehouse-slab': {
    label: 'Heavy-Duty Industrial Yard & Warehouse Floor',
    subtitle: '200mm fiber-reinforced industrial slab with BRC mesh & drainage',
    cementBagsPerSqFt: 0.36,
    steelKgPerSqFt: 3.1,
    bricksPerSqFt: 3.2,
    pipesLengthsPer1000SqFt: 22,
    timberJoistsPer1000SqFt: 10,
  },
};

export const LandingPage: React.FC = () => {
  const {
    setScreen,
    currentUser,
    products,
    suppliers,
    sales,
    purchases,
    settings,
    setCategoryFilterFromHero,
    refreshData,
    addToast,
  } = useStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [catalogueSearch, setCatalogueSearch] = useState<string>('');
  const [catalogueSort, setCatalogueSort] = useState<'name' | 'price-asc' | 'price-desc' | 'stock'>('name');
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<1 | 2 | 3>(1);
  const [syncingLive, setSyncingLive] = useState<boolean>(false);

  // Civil & Structural Area BOQ Calculator State
  const [projectAreaSqFt, setProjectAreaSqFt] = useState<number>(2500);
  const [projectType, setProjectType] = useState<CivilProjectType>('rcc-frame');

  // Interactive Specimen Inspector & Live Project BOQ Estimator
  const [inspectingProduct, setInspectingProduct] = useState<Product | null>(null);
  const [estimateItems, setEstimateItems] = useState<EstimateLineItem[]>([]);
  const [estimateModalOpen, setEstimateModalOpen] = useState<boolean>(false);

  const metrics = useMemo(
    () => computeDashboardMetrics(products, sales, purchases),
    [products, sales, purchases]
  );

  const civilCalculation = useMemo(() => {
    const profile = CIVIL_PROJECT_PROFILES[projectType];
    const safeArea = Math.max(100, Math.min(500000, Number(projectAreaSqFt) || 0));
    const cementBags = Math.ceil(safeArea * profile.cementBagsPerSqFt);
    const steelTons = Number(((safeArea * profile.steelKgPerSqFt) / 1000).toFixed(2));
    const brickPallets = Math.ceil((safeArea * profile.bricksPerSqFt) / 500);
    const upvcPipeLengths = Math.ceil((safeArea / 1000) * profile.pipesLengthsPer1000SqFt);
    const timberJoists = Math.ceil((safeArea / 1000) * profile.timberJoistsPer1000SqFt);

    // Match live product pricing if available in user's database, otherwise use standard trade rate
    const cementUnitRate =
      products.find((p) => p.category === 'Cement')?.sellingPrice ?? 420;
    const steelUnitRate =
      products.find((p) => p.category === 'Steel')?.sellingPrice ?? 68500;
    const brickUnitRate =
      products.find((p) => p.category === 'Bricks')?.sellingPrice ?? 6200;
    const pipeUnitRate =
      products.find((p) => p.category === 'Pipes')?.sellingPrice ?? 1180;
    const timberUnitRate =
      products.find((p) => p.category === 'Timber')?.sellingPrice ?? 2450;

    const rows = [
      {
        division: 'Cement',
        material: 'OPC 53 / Portland Structural Cement',
        unit: '50kg Bags',
        quantity: cementBags,
        unitRate: cementUnitRate,
        lineTotal: Math.round(cementBags * cementUnitRate),
      },
      {
        division: 'Steel',
        material: 'Fe-550D Ribbed TMT Reinforcement Rebar',
        unit: 'Metric Tons',
        quantity: steelTons,
        unitRate: steelUnitRate,
        lineTotal: Math.round(steelTons * steelUnitRate),
      },
      {
        division: 'Bricks',
        material: 'Kilned Wirecut Facing Masonry Bricks',
        unit: 'Pallets (500 pcs)',
        quantity: brickPallets,
        unitRate: brickUnitRate,
        lineTotal: Math.round(brickPallets * brickUnitRate),
      },
      {
        division: 'Pipes',
        material: 'Schedule-80 Heavy UPVC Conduit & Drainage',
        unit: '6m Lengths',
        quantity: upvcPipeLengths,
        unitRate: pipeUnitRate,
        lineTotal: Math.round(upvcPipeLengths * pipeUnitRate),
      },
      {
        division: 'Timber',
        material: 'C24 Kiln-Dried Formwork & Structural Joists',
        unit: '4.8m Lengths',
        quantity: timberJoists,
        unitRate: timberUnitRate,
        lineTotal: Math.round(timberJoists * timberUnitRate),
      },
    ];

    const estimatedSubtotal = rows.reduce((sum, r) => sum + r.lineTotal, 0);
    const gstAmount = Math.round((estimatedSubtotal * (settings.defaultTaxRate ?? 18)) / 100);
    const estimatedGrandTotal = estimatedSubtotal + gstAmount;

    return {
      profile,
      safeArea,
      rows,
      estimatedSubtotal,
      gstAmount,
      estimatedGrandTotal,
    };
  }, [projectAreaSqFt, projectType, products, settings.defaultTaxRate]);

  const handleExportCivilBoqCsv = () => {
    exportToCsv(
      `buildflow_structural_boq_${civilCalculation.safeArea}sqft_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Project Type',
        'Built-Up Area (Sq.Ft)',
        'Division',
        'Material Specification',
        'Unit',
        'Required Quantity',
        'Unit Rate (INR)',
        'Estimated Line Total (INR)',
      ],
      civilCalculation.rows.map((r) => [
        civilCalculation.profile.label,
        civilCalculation.safeArea,
        r.division,
        r.material,
        r.unit,
        r.quantity,
        r.unitRate.toFixed(2),
        r.lineTotal.toFixed(2),
      ])
    );
    addToast(
      'Structural BOQ CSV Downloaded',
      `Exported material schedule for ${formatNumberIN(civilCalculation.safeArea)} sq.ft (${civilCalculation.profile.label}).`,
      'success'
    );
  };

  const openWorkspace = () => {
    if (currentUser) {
      setScreen('dashboard');
    } else {
      setScreen('login');
    }
  };

  const handleNavigateWorkspace = (
    targetScreen: 'dashboard' | 'pos-billing' | 'product-form' = 'dashboard'
  ) => {
    if (currentUser) {
      setScreen(targetScreen);
      return;
    }
    setScreen('login');
  };

  const handleSyncLive = async () => {
    setSyncingLive(true);
    try {
      await refreshData();
      addToast(
        'Live yard data synchronized',
        `Loaded ${products.length} SKUs, ${sales.length} invoices, and ${purchases.length} POs from server.`,
        'success'
      );
    } finally {
      setTimeout(() => setSyncingLive(false), 350);
    }
  };

  const openCatalogueWithCategory = (cat: string) => {
    setCategoryFilterFromHero(cat);
    if (currentUser) {
      setScreen('products');
    } else {
      setScreen('login');
    }
  };

  const filteredPreviewProducts = useMemo(() => {
    const q = catalogueSearch.trim().toLowerCase();
    const list = products.filter((p) => {
      const catMatch = selectedCategory === 'All' || p.category === selectedCategory;
      const qMatch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q);
      return catMatch && qMatch;
    });

    return [...list].sort((a, b) => {
      if (catalogueSort === 'price-asc') return a.sellingPrice - b.sellingPrice;
      if (catalogueSort === 'price-desc') return b.sellingPrice - a.sellingPrice;
      if (catalogueSort === 'stock') return b.quantity - a.quantity;
      return a.name.localeCompare(b.name);
    });
  }, [products, selectedCategory, catalogueSearch, catalogueSort]);

  const addToEstimate = (product: Product, qty = 1) => {
    setEstimateItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(product.quantity || 999, existing.quantity + qty);
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, product, quantity: nextQty } : i
        );
      }
      return [...prev, { product, quantity: Math.min(product.quantity || 1, Math.max(1, qty)) }];
    });
    addToast(
      'Added to Project Estimate',
      `${product.name} (${product.sku}) added to your live BOQ estimate.`,
      'success'
    );
  };

  const updateEstimateQty = (productId: string, nextQty: number) => {
    if (nextQty <= 0) {
      setEstimateItems((prev) => prev.filter((i) => i.product.id !== productId));
      return;
    }
    setEstimateItems((prev) =>
      prev.map((i) =>
        i.product.id === productId
          ? {
              ...i,
              quantity: Math.min(Math.max(1, nextQty), Math.max(1, i.product.quantity)),
            }
          : i
      )
    );
  };

  const estimateTotals = useMemo(() => {
    const subtotal = estimateItems.reduce(
      (sum, item) => sum + item.quantity * item.product.sellingPrice,
      0
    );
    const taxRate = settings.defaultTaxRate ?? 18;
    const taxAmount = Number(((subtotal * taxRate) / 100).toFixed(2));
    const grandTotal = Number((subtotal + taxAmount).toFixed(2));
    const totalUnits = estimateItems.reduce((sum, item) => sum + item.quantity, 0);
    return { subtotal, taxRate, taxAmount, grandTotal, totalUnits };
  }, [estimateItems, settings.defaultTaxRate]);

  const handleExportEstimateCsv = () => {
    if (estimateItems.length === 0) return;
    const headers = [
      'SKU',
      'Material Name',
      'Category',
      'Unit',
      'Warehouse Bay',
      'Quantity',
      'Unit Price (INR)',
      'Line Subtotal (INR)',
      'GST Rate (%)',
      'Line Total Inc. GST (INR)',
    ];
    const rows = estimateItems.map(({ product, quantity }) => {
      const sub = Number((quantity * product.sellingPrice).toFixed(2));
      const gst = Number(((sub * estimateTotals.taxRate) / 100).toFixed(2));
      const total = Number((sub + gst).toFixed(2));
      return [
        product.sku,
        product.name,
        product.category,
        product.unit,
        product.location,
        quantity,
        product.sellingPrice.toFixed(2),
        sub.toFixed(2),
        estimateTotals.taxRate.toFixed(2),
        total.toFixed(2),
      ].map(escapeCsvCell);
    });
    const csv = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.join(','))].join(
      '\r\n'
    );
    downloadCsvFile(
      csv,
      `buildflow_project_estimate_${new Date().toISOString().slice(0, 10)}.csv`
    );
    addToast(
      'Project Estimate Exported',
      'Downloaded BOQ estimate CSV with GST breakdown.',
      'success'
    );
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#252923] flex flex-col selection:bg-[#315744] selection:text-white">
      {/* Top Navigation — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 bg-[#F7F6F2]/95 backdrop-blur-sm border-b border-[#E7E4DC] transition-colors">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-[#252923] font-display whitespace-nowrap shrink-0"
          >
            BuildFlow Supply
          </a>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-8 text-sm font-medium text-[#777A73]"
          >
            <a
              href="#products"
              className="hover:text-[#252923] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Products
            </a>
            <a
              href="#boq-calculator"
              className="hover:text-[#252923] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              BOQ Calculator
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#252923] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <button
              type="button"
              onClick={() => (currentUser ? setScreen('dashboard') : setScreen('login'))}
              className="hover:text-[#252923] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {currentUser ? `Workspace (${currentUser.name.split(' ')[0]})` : 'Sign In / Register'}
            </button>
          </nav>

          {/* Zone 3: Primary action */}
          <div className="flex items-center gap-2.5 shrink-0">
            {estimateItems.length > 0 && (
              <button
                type="button"
                onClick={() => setEstimateModalOpen(true)}
                className="px-3 py-2 text-xs font-mono font-medium text-[#252923] bg-[#FFFFFF] border border-[#315744] hover:bg-[#EDF3F0] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5 text-[#315744]" />
                <span>
                  BOQ ({estimateTotals.totalUnits}) ·{' '}
                  {formatCurrency(estimateTotals.grandTotal, settings.currencySymbol, 0)}
                </span>
              </button>
            )}
            <Button variant="primary" size="md" onClick={openWorkspace}>
              {currentUser ? 'Open Dashboard' : 'Sign In to Workspace'}
            </Button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Section — Balanced Two-Column Layout */}
        <section className="max-w-[1360px] mx-auto px-6 pt-10 pb-14 lg:pt-14 lg:pb-18">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            {/* Left Column */}
            <div className="lg:col-span-5 flex flex-col justify-center py-2">
              <div className="text-xs font-mono tracking-wider text-[#315744] mb-4">
                BUILDING MATERIALS · INVENTORY · GST BILLING
              </div>

              <h1
                className="font-display font-bold text-[#252923] tracking-tight leading-[1.08]"
                style={{
                  fontSize: 'clamp(2.35rem, 3.8vw, 3.65rem)',
                  textWrap: 'balance',
                }}
              >
                Everything your building supply business needs.
              </h1>

              <p className="text-base text-[#777A73] leading-relaxed mt-5 max-w-[54ch]">
                Manage architectural materials, approved supplier mills, live warehouse bay
                stock, and GST contractor invoices from one calm, precision-engineered
                workspace.
              </p>

              <div className="flex flex-wrap items-center gap-3 mt-8">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => handleNavigateWorkspace('dashboard')}
                >
                  <span>
                    {currentUser ? 'Enter Live Dashboard' : 'Sign In / Create Account'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <a
                  href="#boq-calculator"
                  className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-[#252923] bg-[#FFFFFF] border border-[#E7E4DC] hover:bg-[#EFEEE8] transition-colors whitespace-nowrap shrink-0"
                >
                  Structural BOQ Calculator
                </a>
              </div>

              {/* Live Backend Yard Metrics Bar */}
              <div className="mt-9 pt-6 border-t border-[#E7E4DC] grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[11px] font-mono text-[#777A73]">CATALOGUE SKUS</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-[#252923] mt-0.5">
                    {metrics.totalProductsCount} Active
                  </div>
                  <div className="text-[11px] text-[#777A73]">
                    {formatNumberIN(metrics.totalUnitsInStock)} units in bays
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono text-[#777A73]">STOCK VALUATION</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-[#315744] mt-0.5">
                    {formatCurrency(metrics.inventoryRetailValue, settings.currencySymbol, 0)}
                  </div>
                  <div className="text-[11px] text-[#777A73]">Trade retail value</div>
                </div>
                <div>
                  <div className="text-[11px] font-mono text-[#777A73]">APPROVED MILLS</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-[#252923] mt-0.5">
                    {suppliers.length} Suppliers
                  </div>
                  <div className="text-[11px] text-[#BD704F]">
                    {sales.length} GST invoices issued
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column — Interactive 3D Architectural Material Showroom */}
            <div className="lg:col-span-7 min-h-[480px] lg:min-h-[540px] flex flex-col">
              <MaterialShowroom3D
                variant="hero"
                onSelectCategory={(cat) => {
                  setSelectedCategory(cat);
                }}
              />
            </div>
          </div>
        </section>

        {/* Section 1: Product-Category Strip */}
        <section
          aria-label="Material Categories"
          className="border-y border-[#E7E4DC] bg-[#FFFFFF]"
        >
          <div className="max-w-[1360px] mx-auto px-6 py-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div className="text-xs font-mono text-[#777A73]">
                01. CORE ARCHITECTURAL SUPPLY DIVISIONS
              </div>
              <div className="text-xs text-[#777A73]">
                Click any division to filter the live yard catalogue below · Currently showing:{' '}
                <span className="font-semibold text-[#252923]">{selectedCategory}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {HERO_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.name;
                const catProducts = products.filter((p) => p.category === cat.name);
                const catUnits = catProducts.reduce((sum, p) => sum + p.quantity, 0);
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() =>
                      setSelectedCategory((prev) => (prev === cat.name ? 'All' : cat.name))
                    }
                    className={`text-left p-4 border transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#F7F6F2] border-[#315744] ring-1 ring-[#315744]'
                        : 'bg-[#FFFFFF] border-[#E7E4DC] hover:bg-[#F7F6F2] hover:border-[#252923]/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <MaterialSpecimenThumb category={cat.name} size="sm" />
                      <div className="text-right font-mono">
                        <div className="text-xs font-semibold text-[#252923]">
                          {catProducts.length} SKUs
                        </div>
                        <div className="text-[10px] text-[#777A73]">
                          {formatNumberIN(catUnits)} units
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-base font-semibold text-[#252923] font-display flex items-center justify-between">
                        <span>{cat.name}</span>
                        {isSelected && (
                          <span className="text-[10px] font-mono text-[#315744]">ACTIVE</span>
                        )}
                      </div>
                      <p className="text-xs text-[#777A73] mt-1 line-clamp-2">
                        {cat.spec}
                      </p>
                      <div className="text-[11px] font-mono text-[#BD704F] mt-2.5">
                        {cat.unitSummary}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 2: "One workspace. Complete control." — Three Feature Compositions */}
        <section id="solutions" className="max-w-[1360px] mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <div className="text-xs font-mono text-[#315744] mb-2">
              02. OPERATIONAL ARCHITECTURE
            </div>
            <h2
              className="text-3xl font-bold text-[#252923] font-display tracking-tight"
              style={{ textWrap: 'balance' }}
            >
              One workspace. Complete control.
            </h2>
            <p className="text-base text-[#777A73] mt-3">
              Every inward supplier delivery and outward contractor dispatch updates yard
              quantities, unit margins, and ledger balances in a single atomic step.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Feature Composition 1 (Asymmetric Span 5) */}
            <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#E7E4DC] p-7 flex flex-col justify-between hover:border-[#315744]/50 transition-colors">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-[#777A73] mb-4">
                  <span>01. INVENTORY & YARD LEDGER</span>
                  <Layers className="w-4 h-4 text-[#315744]" />
                </div>
                <h3 className="text-xl font-semibold text-[#252923] font-display">
                  Unit-accurate stock across silos, racks, and open bays
                </h3>
                <p className="text-sm text-[#777A73] mt-2.5 leading-relaxed">
                  Track bags, metric tons, strapped pallets, and 6-meter pipe lengths
                  with configurable low-stock thresholds and complete audit trails for
                  every adjustment.
                </p>
              </div>

              <div className="mt-8 pt-5 border-t border-[#E7E4DC] space-y-2.5">
                {products.length > 0 ? (
                  products.slice(0, 2).map((item) => {
                    const st = getStockStatus(item.quantity, item.minStockLevel);
                    return (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <span className="text-[#777A73] truncate pr-2">
                          {item.sku} · {item.location}
                        </span>
                        <span
                          className={`font-mono tabular-nums font-medium shrink-0 ${
                            st === 'In Stock' ? 'text-[#315744]' : 'text-[#BD704F]'
                          }`}
                        >
                          {item.quantity} {item.unit.split(' ')[0]} · {st}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#777A73]">Live Yard Status</span>
                    <button
                      type="button"
                      onClick={() => handleNavigateWorkspace('product-form')}
                      className="font-mono text-[#315744] font-semibold hover:underline cursor-pointer"
                    >
                      + Add First Material SKU →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Feature Composition 2 (Span 4) */}
            <div className="lg:col-span-4 bg-[#FFFFFF] border border-[#E7E4DC] p-7 flex flex-col justify-between hover:border-[#315744]/50 transition-colors">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-[#777A73] mb-4">
                  <span>02. PROCUREMENT & RECEIVING</span>
                  <Truck className="w-4 h-4 text-[#315744]" />
                </div>
                <h3 className="text-xl font-semibold text-[#252923] font-display">
                  Direct supplier purchase orders that restock automatically
                </h3>
                <p className="text-sm text-[#777A73] mt-2.5 leading-relaxed">
                  Record deliveries from cement mills, steel foundries, and timber yards.
                  Completing a purchase entry immediately updates available quantities
                  and landed purchase cost.
                </p>
              </div>

              <div className="mt-8 pt-5 border-t border-[#E7E4DC] flex items-center justify-between text-xs">
                <span className="text-[#777A73]">Approved Trade Suppliers</span>
                <span className="font-mono tabular-nums font-semibold text-[#252923]">
                  {suppliers.length} Active Mills · {purchases.length} POs
                </span>
              </div>
            </div>

            {/* Feature Composition 3 (Span 3) */}
            <div className="lg:col-span-3 bg-[#FFFFFF] border border-[#E7E4DC] p-7 flex flex-col justify-between hover:border-[#315744]/50 transition-colors">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-[#777A73] mb-4">
                  <span>03. TRADE BILLING</span>
                  <FileSpreadsheet className="w-4 h-4 text-[#315744]" />
                </div>
                <h3 className="text-xl font-semibold text-[#252923] font-display">
                  Counter POS & instant GST invoices
                </h3>
                <p className="text-sm text-[#777A73] mt-2.5 leading-relaxed">
                  Build multi-item contractor bills with built-in stock protection,
                  trade discounts, and clean print-ready GST invoices.
                </p>
              </div>

              <div className="mt-8 pt-5 border-t border-[#E7E4DC]">
                <button
                  type="button"
                  onClick={() => handleNavigateWorkspace('pos-billing')}
                  className="text-xs font-semibold text-[#315744] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Launch Point of Sale</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2.5: Interactive Civil & Structural Area BOQ Calculator */}
        <section id="boq-calculator" className="bg-[#EFEEE8] border-t border-[#E7E4DC] py-16">
          <div className="max-w-[1360px] mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5">
                <div className="text-xs font-mono text-[#315744] mb-2">
                  ARCHITECTURAL & CIVIL ESTIMATION ENGINE
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#252923] font-display tracking-tight">
                  Calculate structural material quantities by built-up area
                </h2>
                <p className="text-sm text-[#777A73] mt-2.5 leading-relaxed">
                  Enter your project floor area in square feet and select a structural
                  specification to compute required bags of OPC cement, metric tons of
                  TMT steel, strapped brick pallets, UPVC conduits, and structural timber.
                </p>

                <div className="mt-6 bg-[#FFFFFF] border border-[#E7E4DC] p-5 space-y-4">
                  <div>
                    <label
                      htmlFor="civil-area-input"
                      className="block text-xs font-mono text-[#777A73] mb-1.5"
                    >
                      PROJECT BUILT-UP AREA (SQ.FT)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="civil-area-input"
                        type="number"
                        min={100}
                        max={500000}
                        step={100}
                        value={projectAreaSqFt}
                        onChange={(e) =>
                          setProjectAreaSqFt(Math.max(0, parseInt(e.target.value, 10) || 0))
                        }
                        className="w-full px-3.5 py-2 text-sm font-mono font-semibold bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:border-[#315744]"
                      />
                      {[1500, 5000, 12000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setProjectAreaSqFt(preset)}
                          className={`px-2.5 py-2 text-xs font-mono border transition-colors cursor-pointer shrink-0 ${
                            projectAreaSqFt === preset
                              ? 'bg-[#315744] text-white border-[#315744]'
                              : 'bg-[#F7F6F2] text-[#252923] border-[#E7E4DC] hover:bg-[#EFEEE8]'
                          }`}
                        >
                          {preset.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-[#777A73] mb-1.5">
                      STRUCTURAL SPECIFICATION PROFILE
                    </div>
                    <div className="space-y-2">
                      {(Object.keys(CIVIL_PROJECT_PROFILES) as CivilProjectType[]).map(
                        (key) => {
                          const prof = CIVIL_PROJECT_PROFILES[key];
                          const active = projectType === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setProjectType(key)}
                              className={`w-full text-left p-3 border transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[#F7F6F2] border-[#315744] ring-1 ring-[#315744]'
                                  : 'bg-[#FFFFFF] border-[#E7E4DC] hover:bg-[#F7F6F2]'
                              }`}
                            >
                              <div className="text-xs font-semibold text-[#252923] flex items-center justify-between">
                                <span>{prof.label}</span>
                                {active && (
                                  <span className="text-[10px] font-mono text-[#315744]">
                                    SELECTED
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#777A73] mt-0.5">
                                {prof.subtitle}
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E7E4DC] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E7E4DC]">
                  <div>
                    <div className="text-xs font-mono text-[#315744]">
                      COMPUTED BILL OF QUANTITIES (BOQ)
                    </div>
                    <h3 className="text-lg font-bold text-[#252923] font-display mt-0.5">
                      {formatNumberIN(civilCalculation.safeArea)} sq.ft ·{' '}
                      {civilCalculation.profile.label}
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleExportCivilBoqCsv}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export BOQ to CSV</span>
                  </Button>
                </div>

                <div className="overflow-x-auto mt-4 border border-[#E7E4DC]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                        <th className="py-2.5 px-3">DIVISION</th>
                        <th className="py-2.5 px-3">SPECIFICATION</th>
                        <th className="py-2.5 px-3 text-right">REQUIRED QTY</th>
                        <th className="py-2.5 px-3 text-right">UNIT RATE</th>
                        <th className="py-2.5 px-3 text-right">EST. AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E4DC] text-xs">
                      {civilCalculation.rows.map((row) => (
                        <tr key={row.division} className="hover:bg-[#F7F6F2]/60">
                          <td className="py-2.5 px-3 font-semibold text-[#252923]">
                            {row.division}
                          </td>
                          <td className="py-2.5 px-3 text-[#777A73]">{row.material}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#315744]">
                            {formatNumberIN(row.quantity)} {row.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#777A73]">
                            {formatCurrency(row.unitRate, settings.currencySymbol, 0)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#252923]">
                            {formatCurrency(row.lineTotal, settings.currencySymbol, 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 p-4 bg-[#F7F6F2] border border-[#E7E4DC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-0.5 text-xs">
                    <div className="text-[#777A73]">
                      Subtotal:{' '}
                      <span className="font-mono font-medium text-[#252923]">
                        {formatCurrency(
                          civilCalculation.estimatedSubtotal,
                          settings.currencySymbol,
                          0
                        )}
                      </span>{' '}
                      + GST ({settings.defaultTaxRate ?? 18}%):{' '}
                      <span className="font-mono font-medium text-[#252923]">
                        {formatCurrency(civilCalculation.gstAmount, settings.currencySymbol, 0)}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-[#252923]">
                      Estimated Turnkey Material Outlay:{' '}
                      <span className="font-mono text-[#315744]">
                        {formatCurrency(
                          civilCalculation.estimatedGrandTotal,
                          settings.currencySymbol,
                          0
                        )}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleNavigateWorkspace('pos-billing')}
                  >
                    <span>Procure / Bill in Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Interactive Live Product Catalogue & Project BOQ Estimator */}
        <section id="products" className="bg-[#FFFFFF] border-y border-[#E7E4DC] py-20">
          <div className="max-w-[1360px] mx-auto px-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
              <div>
                <div className="text-xs font-mono text-[#315744] mb-2">
                  03. LIVE MATERIAL CATALOGUE & PROJECT ESTIMATOR
                </div>
                <h2 className="text-3xl font-bold text-[#252923] font-display tracking-tight">
                  Architectural & structural supply catalogue
                </h2>
                <p className="text-sm text-[#777A73] mt-1.5">
                  Live pricing and bay availability from {settings.businessName}. Inspect
                  material specs or build a project BOQ estimate with instant GST calculation.
                </p>
              </div>

              {/* Interactive Category Filter Bar */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F7F6F2] border border-[#E7E4DC]">
                {['All', 'Cement', 'Steel', 'Bricks', 'Pipes', 'Timber', 'Aggregates'].map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC]'
                          : 'text-[#777A73] hover:text-[#252923]'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Search, Sort & Live Estimate Summary Bar */}
            <div className="bg-[#F7F6F2] border border-[#E7E4DC] p-3.5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-[#777A73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    aria-label="Search live material catalogue"
                    placeholder="Search material name, SKU, bay, or mill..."
                    value={catalogueSearch}
                    onChange={(e) => setCatalogueSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:border-[#315744]"
                  />
                </div>

                <select
                  aria-label="Sort catalogue materials"
                  value={catalogueSort}
                  onChange={(e) =>
                    setCatalogueSort(
                      e.target.value as 'name' | 'price-asc' | 'price-desc' | 'stock'
                    )
                  }
                  className="px-3 py-1.5 text-xs bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:border-[#315744]"
                >
                  <option value="name">Sort: Material Name (A–Z)</option>
                  <option value="price-asc">Sort: Unit Price (Low to High)</option>
                  <option value="price-desc">Sort: Unit Price (High to Low)</option>
                  <option value="stock">Sort: Available Yard Stock</option>
                </select>

                <span className="text-xs font-mono text-[#777A73]">
                  Showing {filteredPreviewProducts.length} of {products.length} materials
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setEstimateModalOpen(true)}
                  className="px-3.5 py-1.5 text-xs font-medium bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC] hover:border-[#315744] transition-colors inline-flex items-center gap-2 cursor-pointer"
                >
                  <Calculator className="w-3.5 h-3.5 text-[#315744]" />
                  <span>
                    Project BOQ Estimator ({estimateItems.length}{' '}
                    {estimateItems.length === 1 ? 'item' : 'items'})
                  </span>
                </button>
              </div>
            </div>

            {products.length === 0 ? (
              <div className="bg-[#F7F6F2] border border-[#E7E4DC] p-12 text-center">
                <div className="text-xs font-mono text-[#315744] mb-1">
                  LIVE YARD DATABASE · READY FOR YOUR CATALOGUE
                </div>
                <div className="text-base font-semibold text-[#252923]">
                  No building materials have been added to your yard catalogue yet
                </div>
                <p className="text-xs text-[#777A73] mt-1.5 max-w-lg mx-auto leading-relaxed">
                  Your database starts completely clean with zero dummy or pre-seeded data. Sign
                  in or create an account to add your real cement, steel, brick, pipe, and timber
                  SKUs.
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => handleNavigateWorkspace('product-form')}
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {currentUser ? 'Add First Material SKU' : 'Sign In to Add First Material'}
                    </span>
                  </Button>
                </div>
              </div>
            ) : filteredPreviewProducts.length === 0 ? (
              <div className="bg-[#F7F6F2] border border-[#E7E4DC] p-10 text-center">
                <div className="text-sm font-semibold text-[#252923]">
                  No materials match your search filter
                </div>
                <p className="text-xs text-[#777A73] mt-1">
                  Try clearing the search query or selecting "All" material divisions.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setCatalogueSearch('');
                  }}
                  className="mt-4 px-4 py-1.5 text-xs font-medium bg-[#315744] text-white cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPreviewProducts.map((product) => {
                  const status = getStockStatus(product.quantity, product.minStockLevel);
                  const inEstimate = estimateItems.find(
                    (i) => i.product.id === product.id
                  );
                  return (
                    <div
                      key={product.id}
                      className="bg-[#F7F6F2] border border-[#E7E4DC] p-5 flex flex-col justify-between hover:border-[#315744] transition-all duration-150"
                    >
                      <div>
                        <div className="flex items-start gap-4">
                          <MaterialSpecimenThumb category={product.category} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-[#777A73] flex items-center gap-1.5">
                              <span>{product.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{product.sku}</span>
                            </div>
                            <h3 className="text-base font-semibold text-[#252923] mt-1 leading-snug">
                              {product.name}
                            </h3>
                            <div className="text-[11px] text-[#777A73] mt-1">
                              {product.location} · {product.supplierName}
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-[#777A73] mt-3.5 leading-relaxed">
                          {product.specification}
                        </p>
                      </div>

                      <div className="mt-5 pt-4 border-t border-[#E7E4DC] space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-semibold font-mono tabular-nums text-[#252923]">
                              {formatCurrency(
                                product.sellingPrice,
                                settings.currencySymbol
                              )}
                            </span>
                            <span className="text-xs text-[#777A73]">
                              {' '}
                              / {product.unit}
                            </span>
                          </div>

                          <StatusIndicator
                            status={status}
                            detail={`${product.quantity} ${product.unit.split(' ')[0]}`}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setInspectingProduct(product)}
                            className="px-3 py-1.5 text-xs font-medium text-[#252923] bg-[#FFFFFF] border border-[#E7E4DC] hover:bg-[#EFEEE8] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#777A73]" />
                            <span>Inspect Specimen</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => addToEstimate(product, 1)}
                              disabled={product.quantity <= 0}
                              className={`px-3 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer ${
                                inEstimate
                                  ? 'bg-[#EDF3F0] text-[#315744] border border-[#315744]'
                                  : 'bg-[#315744] text-white hover:bg-[#264536]'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>
                                {inEstimate
                                  ? `In BOQ (${inEstimate.quantity})`
                                  : 'Add to BOQ'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openCatalogueWithCategory(product.category)}
                              className="text-xs font-medium text-[#315744] hover:underline whitespace-nowrap cursor-pointer px-1"
                            >
                              Manage
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Interactive 3-Step Live Workspace Preview */}
        <section id="how-it-works" className="max-w-[1360px] mx-auto px-6 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-4">
              <div className="text-xs font-mono text-[#315744] mb-2">
                04. HOW IT WORKS · INTERACTIVE LIVE PREVIEW
              </div>
              <h2
                className="text-3xl font-bold text-[#252923] font-display tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Designed for daily clarity at the trade counter.
              </h2>
              <p className="text-sm text-[#777A73] mt-3 leading-relaxed">
                Click any operational step below to inspect live database records from
                your material catalogue, supplier purchase orders, and GST sales invoices.
              </p>

              <div className="mt-7 space-y-3 border-t border-[#E7E4DC] pt-6">
                <button
                  type="button"
                  onClick={() => setActiveWorkflowStep(1)}
                  className={`w-full text-left p-4 border transition-colors cursor-pointer flex items-start gap-3 ${
                    activeWorkflowStep === 1
                      ? 'bg-[#FFFFFF] border-[#315744] ring-1 ring-[#315744]'
                      : 'bg-[#F7F6F2] border-[#E7E4DC] hover:bg-[#FFFFFF]'
                  }`}
                >
                  <span className="text-xs font-mono font-semibold text-[#315744] mt-0.5">
                    01.
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[#252923] flex items-center justify-between">
                      <span>Maintain your material catalogue</span>
                      <span className="text-[11px] font-mono text-[#777A73]">
                        {products.length} SKUs
                      </span>
                    </div>
                    <p className="text-xs text-[#777A73] mt-1">
                      Organize SKUs by unit, bay location, purchase cost, and minimum
                      stock threshold.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveWorkflowStep(2)}
                  className={`w-full text-left p-4 border transition-colors cursor-pointer flex items-start gap-3 ${
                    activeWorkflowStep === 2
                      ? 'bg-[#FFFFFF] border-[#315744] ring-1 ring-[#315744]'
                      : 'bg-[#F7F6F2] border-[#E7E4DC] hover:bg-[#FFFFFF]'
                  }`}
                >
                  <span className="text-xs font-mono font-semibold text-[#315744] mt-0.5">
                    02.
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[#252923] flex items-center justify-between">
                      <span>Log supplier purchase orders</span>
                      <span className="text-[11px] font-mono text-[#777A73]">
                        {purchases.length} POs
                      </span>
                    </div>
                    <p className="text-xs text-[#777A73] mt-1">
                      Receive inward stock from mills and automatically update yard
                      quantities.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveWorkflowStep(3)}
                  className={`w-full text-left p-4 border transition-colors cursor-pointer flex items-start gap-3 ${
                    activeWorkflowStep === 3
                      ? 'bg-[#FFFFFF] border-[#315744] ring-1 ring-[#315744]'
                      : 'bg-[#F7F6F2] border-[#E7E4DC] hover:bg-[#FFFFFF]'
                  }`}
                >
                  <span className="text-xs font-mono font-semibold text-[#315744] mt-0.5">
                    03.
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[#252923] flex items-center justify-between">
                      <span>Bill contractors & print invoices</span>
                      <span className="text-[11px] font-mono text-[#777A73]">
                        {sales.length} Invoices
                      </span>
                    </div>
                    <p className="text-xs text-[#777A73] mt-1">
                      Verify live availability at checkout, deduct stock atomically, and
                      issue clean GST tax invoices.
                    </p>
                  </div>
                </button>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleNavigateWorkspace('dashboard')}
                >
                  <span>
                    {currentUser ? 'Open Full Management App' : 'Sign In to Management App'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Embedded Editorial Workspace Preview Frame */}
            <div className="lg:col-span-8 bg-[#FFFFFF] border border-[#E7E4DC] p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E7E4DC]">
                <div>
                  <div className="text-xs font-mono text-[#777A73]">
                    BUILDFLOW SUPPLY · LIVE BACKEND SNAPSHOT
                  </div>
                  <div className="text-base font-semibold text-[#252923] mt-0.5">
                    {settings.businessName} — {settings.warehouseAddress.split(',')[0]}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSyncLive()}
                    disabled={syncingLive}
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${syncingLive ? 'animate-spin' : ''}`}
                    />
                    <span>{syncingLive ? 'Syncing...' : 'Sync Live'}</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleNavigateWorkspace('dashboard')}
                  >
                    {currentUser ? 'Enter Workspace' : 'Sign In'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-5">
                <div className="bg-[#F7F6F2] border border-[#E7E4DC] p-3.5">
                  <div className="text-[11px] text-[#777A73]">Recorded Sales</div>
                  <div className="text-lg font-semibold font-mono tabular-nums text-[#315744] mt-1">
                    {formatCurrency(metrics.totalSalesRevenue, settings.currencySymbol)}
                  </div>
                </div>
                <div className="bg-[#F7F6F2] border border-[#E7E4DC] p-3.5">
                  <div className="text-[11px] text-[#777A73]">Procurement</div>
                  <div className="text-lg font-semibold font-mono tabular-nums text-[#252923] mt-1">
                    {formatCurrency(metrics.totalPurchasesSpend, settings.currencySymbol)}
                  </div>
                </div>
                <div className="bg-[#F7F6F2] border border-[#E7E4DC] p-3.5">
                  <div className="text-[11px] text-[#777A73]">Catalogue SKUs</div>
                  <div className="text-lg font-semibold font-mono tabular-nums text-[#252923] mt-1">
                    {metrics.totalProductsCount} Items
                  </div>
                </div>
                <div className="bg-[#F7F6F2] border border-[#E7E4DC] p-3.5">
                  <div className="text-[11px] text-[#777A73]">Low Stock Alerts</div>
                  <div className="text-lg font-semibold font-mono tabular-nums text-[#BD704F] mt-1">
                    {metrics.lowStockProductsCount} SKUs
                  </div>
                </div>
              </div>

              {/* Dynamic Preview Table Driven by Active Workflow Step */}
              <div className="overflow-x-auto border border-[#E7E4DC]">
                {activeWorkflowStep === 1 && (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                        <th className="py-2.5 px-3">MATERIAL</th>
                        <th className="py-2.5 px-3">SKU</th>
                        <th className="py-2.5 px-3">BAY</th>
                        <th className="py-2.5 px-3 text-right">AVAILABLE</th>
                        <th className="py-2.5 px-3 text-right">UNIT PRICE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E4DC] text-xs">
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 px-4 text-center text-[#777A73]">
                            No materials added yet. Sign in to add your first material SKU.
                          </td>
                        </tr>
                      ) : (
                        products.slice(0, 6).map((item) => (
                          <tr key={item.id} className="hover:bg-[#F7F6F2]/60">
                            <td className="py-2.5 px-3 font-medium text-[#252923]">
                              {item.name}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[#777A73]">
                              {item.sku}
                            </td>
                            <td className="py-2.5 px-3 text-[#777A73]">{item.location}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#252923]">
                              {item.quantity} {item.unit.split(' ')[0]}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-[#252923]">
                              {formatCurrency(item.sellingPrice, settings.currencySymbol)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {activeWorkflowStep === 2 && (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                        <th className="py-2.5 px-3">PO NUMBER</th>
                        <th className="py-2.5 px-3">SUPPLIER MILL</th>
                        <th className="py-2.5 px-3">MATERIAL RECEIVED</th>
                        <th className="py-2.5 px-3 text-right">QTY</th>
                        <th className="py-2.5 px-3 text-right">TOTAL (INC. GST)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E4DC] text-xs">
                      {purchases.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 px-4 text-center text-[#777A73]">
                            No purchase orders logged yet. Sign in to record inward mill deliveries.
                          </td>
                        </tr>
                      ) : (
                        purchases.slice(0, 6).map((po) => (
                          <tr key={po.id} className="hover:bg-[#F7F6F2]/60">
                            <td className="py-2.5 px-3 font-mono font-medium text-[#252923]">
                              {po.poNumber}
                            </td>
                            <td className="py-2.5 px-3 text-[#252923]">{po.supplierName}</td>
                            <td className="py-2.5 px-3 text-[#777A73]">{po.productName}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#315744] font-medium">
                              +{po.quantity}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-[#252923]">
                              {formatCurrency(po.totalAmount, settings.currencySymbol)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {activeWorkflowStep === 3 && (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                        <th className="py-2.5 px-3">INVOICE #</th>
                        <th className="py-2.5 px-3">CONTRACTOR / FIRM</th>
                        <th className="py-2.5 px-3">PRIMARY MATERIAL</th>
                        <th className="py-2.5 px-3">STATUS</th>
                        <th className="py-2.5 px-3 text-right">GRAND TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E4DC] text-xs">
                      {sales.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 px-4 text-center text-[#777A73]">
                            No GST sales invoices issued yet. Sign in to bill contractors at the POS counter.
                          </td>
                        </tr>
                      ) : (
                        sales.slice(0, 6).map((inv) => (
                          <tr key={inv.id} className="hover:bg-[#F7F6F2]/60">
                            <td className="py-2.5 px-3 font-mono font-medium text-[#252923]">
                              {inv.invoiceNumber}
                            </td>
                            <td className="py-2.5 px-3 text-[#252923]">
                              {inv.customerCompany}
                            </td>
                            <td className="py-2.5 px-3 text-[#777A73]">
                              {inv.primaryProductName} ({inv.totalQuantity} units)
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusIndicator status={inv.paymentStatus} />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-[#252923]">
                              {formatCurrency(inv.grandTotal, settings.currencySymbol)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Final Call-to-Action Section */}
        <section className="bg-[#EFEEE8] border-t border-[#E7E4DC] py-16">
          <div className="max-w-[1360px] mx-auto px-6 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-xl">
              <div className="text-xs font-mono text-[#315744] mb-2">
                READY FOR DAILY OPERATIONS
              </div>
              <h2
                className="text-2xl sm:text-3xl font-bold text-[#252923] font-display tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Run your building material yard with calm, structured precision.
              </h2>
              <p className="text-sm text-[#777A73] mt-2">
                Sign in or create an account to add your real inventory, record supplier
                deliveries, and issue contractor GST invoices.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Button
                variant="primary"
                size="lg"
                onClick={() => handleNavigateWorkspace('dashboard')}
              >
                <span>
                  {currentUser ? 'Open Live Dashboard' : 'Sign In / Create Account'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Section 6: Minimal Footer */}
      <footer className="bg-[#FFFFFF] border-t border-[#E7E4DC] py-8">
        <div className="max-w-[1360px] mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#777A73]">
          <div className="flex items-center gap-3">
            <span className="font-bold text-[#252923] font-display">BuildFlow Supply</span>
            <span aria-hidden="true">·</span>
            <span>Architectural Materials, Inventory & Billing Platform</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <a href="#products" className="hover:text-[#252923] transition-colors">
              Catalogue
            </a>
            <a href="#boq-calculator" className="hover:text-[#252923] transition-colors">
              BOQ Calculator
            </a>
            <a href="#how-it-works" className="hover:text-[#252923] transition-colors">
              How It Works
            </a>
            <button
              type="button"
              onClick={openWorkspace}
              className="hover:text-[#252923] transition-colors cursor-pointer"
            >
              Management Dashboard
            </button>
          </div>
        </div>
      </footer>

      {/* Material Specimen Inspection Modal */}
      <Dialog
        open={Boolean(inspectingProduct)}
        onClose={() => setInspectingProduct(null)}
        title={inspectingProduct?.name || 'Material Specification'}
        subtitle={
          inspectingProduct
            ? `${inspectingProduct.category} · SKU: ${inspectingProduct.sku} · ${inspectingProduct.location}`
            : ''
        }
        maxWidth="max-w-xl"
      >
        {inspectingProduct && (
          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-4 p-4 bg-[#F7F6F2] border border-[#E7E4DC]">
              <MaterialSpecimenThumb category={inspectingProduct.category} size="lg" />
              <div className="space-y-1.5 flex-1">
                <div className="text-[11px] font-mono text-[#315744]">
                  ARCHITECTURAL SPECIFICATION
                </div>
                <p className="text-xs text-[#252923] leading-relaxed">
                  {inspectingProduct.specification}
                </p>
                {inspectingProduct.description && (
                  <p className="text-xs text-[#777A73] leading-relaxed">
                    {inspectingProduct.description}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-[#F7F6F2] border border-[#E7E4DC]">
                <div className="text-[10px] font-mono text-[#777A73]">TRADE SELLING PRICE</div>
                <div className="text-sm font-bold font-mono text-[#315744] mt-1">
                  {formatCurrency(
                    inspectingProduct.sellingPrice,
                    settings.currencySymbol
                  )}{' '}
                  / {inspectingProduct.unit}
                </div>
              </div>
              <div className="p-3 bg-[#F7F6F2] border border-[#E7E4DC]">
                <div className="text-[10px] font-mono text-[#777A73]">AVAILABLE YARD STOCK</div>
                <div className="text-sm font-bold font-mono text-[#252923] mt-1">
                  {inspectingProduct.quantity} {inspectingProduct.unit}
                </div>
              </div>
              <div className="p-3 bg-[#F7F6F2] border border-[#E7E4DC]">
                <div className="text-[10px] font-mono text-[#777A73]">WAREHOUSE BAY</div>
                <div className="text-sm font-semibold text-[#252923] mt-1">
                  {inspectingProduct.location}
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-[#FFFFFF] border border-[#E7E4DC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-[#777A73]" />
                <div>
                  <div className="text-[11px] text-[#777A73]">Approved Supplier Mill</div>
                  <div className="text-xs font-semibold text-[#252923]">
                    {inspectingProduct.supplierName}
                  </div>
                </div>
              </div>
              <StatusIndicator
                status={getStockStatus(
                  inspectingProduct.quantity,
                  inspectingProduct.minStockLevel
                )}
                detail={`Min ${inspectingProduct.minStockLevel}`}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E7E4DC]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInspectingProduct(null)}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  addToEstimate(inspectingProduct, 5);
                  setInspectingProduct(null);
                  setEstimateModalOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add 5 Units to BOQ Estimate</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setInspectingProduct(null);
                  handleNavigateWorkspace('pos-billing');
                }}
              >
                <span>Bill in Counter POS</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Project Material Estimate (BOQ) Modal */}
      <Dialog
        open={estimateModalOpen}
        onClose={() => setEstimateModalOpen(false)}
        title="Project Material Estimate (BOQ)"
        subtitle={`Live trade quotation with ${estimateTotals.taxRate}% GST calculation · ${settings.businessName}`}
        maxWidth="max-w-2xl"
      >
        {estimateItems.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="text-sm font-semibold text-[#252923]">
              Your project estimate is currently empty
            </div>
            <p className="text-xs text-[#777A73] max-w-md mx-auto">
              Click "Add to BOQ" on any building material in the catalogue to calculate
              instant project quantities, trade pricing, and GST totals.
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setEstimateModalOpen(false)}
            >
              Browse Catalogue Materials
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border border-[#E7E4DC] divide-y divide-[#E7E4DC] max-h-72 overflow-y-auto">
              {estimateItems.map(({ product, quantity }) => (
                <div
                  key={product.id}
                  className="p-3 flex items-center justify-between gap-3 bg-[#F7F6F2]/50 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[#252923] truncate">
                      {product.name}
                    </div>
                    <div className="text-[11px] font-mono text-[#777A73]">
                      {product.sku} ·{' '}
                      {formatCurrency(product.sellingPrice, settings.currencySymbol)} /{' '}
                      {product.unit} · Available: {product.quantity}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-label={`Decrease estimate quantity for ${product.name}`}
                      onClick={() => updateEstimateQty(product.id, quantity - 1)}
                      className="p-1 bg-[#FFFFFF] border border-[#E7E4DC] hover:bg-[#EFEEE8] cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      aria-label={`Estimate quantity for ${product.name}`}
                      min={1}
                      max={product.quantity}
                      value={quantity}
                      onChange={(e) =>
                        updateEstimateQty(product.id, parseInt(e.target.value, 10) || 1)
                      }
                      className="w-14 text-center py-1 text-xs font-mono tabular-nums bg-[#FFFFFF] border border-[#E7E4DC]"
                    />
                    <button
                      type="button"
                      aria-label={`Increase estimate quantity for ${product.name}`}
                      onClick={() => updateEstimateQty(product.id, quantity + 1)}
                      className="p-1 bg-[#FFFFFF] border border-[#E7E4DC] hover:bg-[#EFEEE8] cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${product.name} from estimate`}
                      onClick={() => updateEstimateQty(product.id, 0)}
                      className="p-1 text-[#777A73] hover:text-[#9E3B24] cursor-pointer ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="w-28 text-right font-mono tabular-nums font-semibold text-[#252923] shrink-0">
                    {formatCurrency(
                      quantity * product.sellingPrice,
                      settings.currencySymbol
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-[#F7F6F2] border border-[#E7E4DC] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#777A73]">
                  Materials Subtotal ({estimateTotals.totalUnits} total units)
                </span>
                <span className="font-mono tabular-nums text-[#252923]">
                  {formatCurrency(estimateTotals.subtotal, settings.currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777A73]">
                  Estimated GST ({estimateTotals.taxRate}%)
                </span>
                <span className="font-mono tabular-nums text-[#252923]">
                  {formatCurrency(estimateTotals.taxAmount, settings.currencySymbol)}
                </span>
              </div>
              <div className="pt-2 border-t border-[#E7E4DC] flex justify-between text-sm font-bold">
                <span className="text-[#252923]">Estimated Grand Total (Inc. GST)</span>
                <span className="font-mono tabular-nums text-[#315744]">
                  {formatCurrency(estimateTotals.grandTotal, settings.currencySymbol)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E7E4DC]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportEstimateCsv}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download BOQ CSV</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEstimateModalOpen(false)}
                >
                  Continue Browsing
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEstimateModalOpen(false);
                    handleNavigateWorkspace('pos-billing');
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Convert to Counter Invoice</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
