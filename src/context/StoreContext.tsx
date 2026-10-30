import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  auth,
  googleProvider,
} from '../lib/firebase';
import {
  AppScreen,
  BusinessSettings,
  Customer,
  DatabaseStatusInfo,
  DatePeriodFilter,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  Product,
  PurchaseOrder,
  SaleCartItem,
  SaleInvoice,
  StockMovement,
  Supplier,
  TeamMember,
  UserRole,
} from '../types';
import { formatCurrency } from '../utils/inventoryLogic';

const DEFAULT_SETTINGS: BusinessSettings = {
  id: 'default_settings',
  businessName: 'BuildFlow Supply',
  legalName: 'BuildFlow Architectural Materials Pvt. Ltd.',
  taxRegistrationNumber: '29AAACB8921F1Z5',
  currencySymbol: '₹',
  currencyCode: 'INR',
  defaultTaxRate: 18,
  invoicePrefix: 'BFS-INV-',
  warehouseAddress: 'Plot 14, Industrial Material Yard, Peenya Stage II, Bengaluru 560058',
  contactEmail: 'dispatch@buildflowsupply.com',
  contactPhone: '+91 80 4120 9900',
  lowStockGlobalThreshold: 30,
  ownerId: 'workspace_owner',
  updatedAt: new Date().toISOString(),
};

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export interface AuthSessionUser {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  isFirebaseBacked: boolean;
}

interface StoreContextValue {
  screen: AppScreen;
  setScreen: (screen: AppScreen) => void;
  currentUser: AuthSessionUser | null;
  authLoading: boolean;
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  purchases: PurchaseOrder[];
  sales: SaleInvoice[];
  payments: PaymentRecord[];
  movements: StockMovement[];
  team: TeamMember[];
  settings: BusinessSettings;
  dbStatus: DatabaseStatusInfo | null;
  dashboardPeriod: DatePeriodFilter;
  setDashboardPeriod: (period: DatePeriodFilter) => void;
  editingProduct: Product | null;
  setEditingProduct: (product: Product | null) => void;
  selectedInvoice: SaleInvoice | null;
  setSelectedInvoice: (invoice: SaleInvoice | null) => void;
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  categoryFilterFromHero: string;
  setCategoryFilterFromHero: (cat: string) => void;
  inventoryFilterPreset: 'all' | 'low';
  setInventoryFilterPreset: (preset: 'all' | 'low') => void;
  toasts: ToastMessage[];
  addToast: (title: string, description?: string, variant?: ToastMessage['variant']) => void;
  removeToast: (id: string) => void;
  refreshData: () => Promise<void>;
  // Auth actions
  loginWithGoogle: () => Promise<void>;
  loginWithCredentials: (emailOrUsername: string, password: string, remember: boolean) => Promise<void>;
  registerAccount: (input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: UserRole;
    department?: string;
    businessName?: string;
  }) => Promise<void>;
  resetPasswordWithEmail: (email: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  // CRUD & Operational actions
  saveProduct: (productData: Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  adjustStockQuantity: (productId: string, quantityDelta: number, reason: string) => Promise<void>;
  recordPurchase: (input: {
    supplierId: string;
    productId?: string;
    quantity?: number;
    unitPrice?: number;
    items?: Array<{ productId: string; quantity: number; unitPrice: number }>;
    taxRate?: number;
    paymentStatus: PaymentStatus;
    amountPaid?: number;
    notes: string;
  }) => Promise<PurchaseOrder>;
  completeSale: (input: {
    customerId: string;
    cartItems: SaleCartItem[];
    discountAmount: number;
    taxRate?: number;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    amountPaid?: number;
    notes: string;
    idempotencyKey?: string;
  }) => Promise<SaleInvoice>;
  recordPayment: (input: {
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    notes?: string;
  }) => Promise<void>;
  saveSupplier: (supplierData: Omit<Supplier, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteSupplier: (supplierId: string) => Promise<void>;
  saveCustomer: (customerData: Omit<Customer, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteCustomer: (customerId: string) => Promise<void>;
  saveTeamMember: (memberData: Omit<TeamMember, 'uid' | 'createdAt' | 'updatedAt'> & { uid?: string; password?: string }) => Promise<void>;
  deleteTeamMember: (uid: string) => Promise<void>;
  saveBusinessSettings: (newSettings: Omit<BusinessSettings, 'id' | 'ownerId' | 'updatedAt'>) => Promise<void>;
  resetToSeedData: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

const TOKEN_KEY = 'buildflow_jwt_token';
const USER_KEY = 'buildflow_session_user';

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [screen, setScreenState] = useState<AppScreen>(() => {
    if (isAutostart) return 'dashboard';
    try {
      const savedScreen = sessionStorage.getItem('buildflow_active_screen') as AppScreen | null;
      if (savedScreen && savedScreen !== 'login') {
        if (savedScreen !== 'landing' && !getStoredToken()) return 'landing';
        return savedScreen;
      }
    } catch {
      // ignore
    }
    return 'landing';
  });
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(() => {
    try {
      const saved = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [sales, setSales] = useState<SaleInvoice[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [dbStatus, setDbStatus] = useState<DatabaseStatusInfo | null>(null);
  const [dashboardPeriod, setDashboardPeriod] = useState<DatePeriodFilter>('all');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedInvoice, setSelectedInvoiceState] = useState<SaleInvoice | null>(null);

  const setSelectedInvoice = useCallback((inv: SaleInvoice | null) => {
    setSelectedInvoiceState(inv);
    try {
      if (inv?.id) {
        sessionStorage.setItem('buildflow_selected_invoice_id', inv.id);
      } else {
        sessionStorage.removeItem('buildflow_selected_invoice_id');
      }
    } catch {
      // ignore
    }
  }, []);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [categoryFilterFromHero, setCategoryFilterFromHero] = useState<string>('All');
  const [inventoryFilterPreset, setInventoryFilterPreset] = useState<'all' | 'low'>('all');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (title: string, description?: string, variant: ToastMessage['variant'] = 'default') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, title, description, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Route guard: redirect operational screens to login if unauthenticated
  const setScreen = useCallback(
    (target: AppScreen) => {
      if (target !== 'landing' && target !== 'login' && !currentUser && !getStoredToken()) {
        setScreenState('login');
        try {
          sessionStorage.setItem('buildflow_active_screen', 'login');
        } catch {
          // ignore
        }
        return;
      }
      setScreenState(target);
      try {
        sessionStorage.setItem('buildflow_active_screen', target);
      } catch {
        // ignore
      }
    },
    [currentUser]
  );

  const refreshData = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      try {
        const pub = await apiFetch('/api/public/catalog');
        if (Array.isArray(pub.products)) setProducts(pub.products);
        if (Array.isArray(pub.suppliers)) setSuppliers(pub.suppliers);
        if (Array.isArray(pub.sales)) setSales(pub.sales);
        if (Array.isArray(pub.purchases)) setPurchases(pub.purchases);
        if (pub.settings) setSettings(pub.settings);
        if (pub.dbStatus) setDbStatus(pub.dbStatus);
      } catch {
        // ignore network error during startup
      }
      return;
    }

    const data = await apiFetch('/api/bootstrap');
    if (Array.isArray(data.products)) setProducts(data.products);
    if (Array.isArray(data.suppliers)) setSuppliers(data.suppliers);
    if (Array.isArray(data.customers)) setCustomers(data.customers);
    if (Array.isArray(data.purchases)) setPurchases(data.purchases);
    if (Array.isArray(data.sales)) {
      setSales(data.sales);
      setSelectedInvoiceState((prev) => {
        const savedId =
          prev?.id ||
          (() => {
            try {
              return sessionStorage.getItem('buildflow_selected_invoice_id');
            } catch {
              return null;
            }
          })();
        if (savedId) {
          const found = data.sales.find((s: SaleInvoice) => s.id === savedId);
          if (found) return found;
        }
        return data.sales[0] || null;
      });
    }
    if (Array.isArray(data.payments)) setPayments(data.payments);
    if (Array.isArray(data.movements)) setMovements(data.movements);
    if (Array.isArray(data.team)) setTeam(data.team);
    if (data.settings) setSettings(data.settings);
    if (data.dbStatus) setDbStatus(data.dbStatus);
  }, []);

  // Initialize session and bootstrap backend state on mount
  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        // Always fetch public catalog first so landing page 3D showroom has real stock
        const pub = await apiFetch('/api/public/catalog').catch(() => null);
        if (mounted && pub) {
          if (Array.isArray(pub.products)) setProducts(pub.products);
          if (Array.isArray(pub.suppliers)) setSuppliers(pub.suppliers);
          if (Array.isArray(pub.sales)) setSales(pub.sales);
          if (Array.isArray(pub.purchases)) setPurchases(pub.purchases);
          if (pub.settings) setSettings(pub.settings);
          if (pub.dbStatus) setDbStatus(pub.dbStatus);
        }

        const existingToken = getStoredToken();
        if (existingToken) {
          try {
            const me = await apiFetch('/api/auth/me');
            if (mounted && me?.user) {
              const sessionUser: AuthSessionUser = {
                uid: me.user.uid,
                name: me.user.name,
                email: me.user.email,
                role: me.user.role,
                isFirebaseBacked: false,
              };
              setCurrentUser(sessionUser);
              await refreshData();
              setAuthLoading(false);
              return;
            }
          } catch {
            // Token expired or invalid
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(USER_KEY);
            if (mounted) setCurrentUser(null);
          }
        }

        if (isAutostart) {
          const loginRes = await apiFetch('/api/auth/autostart', {
            method: 'POST',
          });
          localStorage.setItem(TOKEN_KEY, loginRes.token);
          const sessionUser: AuthSessionUser = {
            uid: loginRes.user.uid,
            name: loginRes.user.name,
            email: loginRes.user.email,
            role: loginRes.user.role,
            isFirebaseBacked: false,
          };
          localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
          if (mounted) {
            setCurrentUser(sessionUser);
            await refreshData();
            setScreenState('dashboard');
          }
        }
      } catch (err) {
        console.error('Bootstrap error:', err);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    bootstrap();

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void refreshData();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      mounted = false;
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isAutostart, refreshData]);

  const loginWithGoogle = async () => {
    const res = await signInWithPopup(auth, googleProvider);
    const fbUser = res.user;
    const loginRes = await apiFetch<{
      token: string;
      user: TeamMember;
      dbStatus?: DatabaseStatusInfo;
    }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        uid: fbUser.uid,
        email: fbUser.email,
        name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Google User',
      }),
    });
    localStorage.setItem(TOKEN_KEY, loginRes.token);
    const sessionUser: AuthSessionUser = {
      uid: loginRes.user.uid,
      name: loginRes.user.name,
      email: loginRes.user.email,
      role: loginRes.user.role,
      isFirebaseBacked: true,
    };
    setCurrentUser(sessionUser);
    localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
    if (loginRes.dbStatus) setDbStatus(loginRes.dbStatus);
    await refreshData();
    setScreenState('dashboard');
    try {
      sessionStorage.setItem('buildflow_active_screen', 'dashboard');
    } catch {
      // ignore
    }
    addToast('Signed in with Google', `Welcome, ${sessionUser.name}.`, 'success');
  };

  const loginWithCredentials = async (
    emailOrUsername: string,
    password: string,
    remember: boolean
  ) => {
    const trimmedIdentity = emailOrUsername.trim();
    if (!trimmedIdentity) {
      throw new Error('Please enter your workspace email address.');
    }
    if (!password) {
      throw new Error('Please enter your password.');
    }

    const data = await apiFetch<{
      token: string;
      user: TeamMember;
      dbStatus?: DatabaseStatusInfo;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: trimmedIdentity,
        password,
      }),
    });

    const sessionUser: AuthSessionUser = {
      uid: data.user.uid,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      isFirebaseBacked: false,
    };

    try {
      if (remember) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
      } else {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        sessionStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
      }
      sessionStorage.setItem('buildflow_active_screen', 'dashboard');
    } catch {
      // ignore storage errors
    }

    setCurrentUser(sessionUser);
    if (data.dbStatus) setDbStatus(data.dbStatus);
    await refreshData();
    setScreenState('dashboard');
    addToast(
      'Signed in to BuildFlow Supply',
      `Active session: ${sessionUser.name} (${sessionUser.role})`,
      'success'
    );
  };

  const registerAccount = async (input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: UserRole;
    department?: string;
    businessName?: string;
  }) => {
    const data = await apiFetch<{
      token: string;
      user: TeamMember;
      dbStatus?: DatabaseStatusInfo;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    const sessionUser: AuthSessionUser = {
      uid: data.user.uid,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      isFirebaseBacked: false,
    };

    try {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
      sessionStorage.setItem('buildflow_active_screen', 'dashboard');
    } catch {
      // ignore storage errors
    }

    setCurrentUser(sessionUser);
    if (data.dbStatus) setDbStatus(data.dbStatus);
    await refreshData();
    setScreenState('dashboard');
    addToast(
      'Workspace account created',
      `Welcome to BuildFlow Supply, ${sessionUser.name} (${sessionUser.role}).`,
      'success'
    );
  };

  const resetPasswordWithEmail = async (email: string, newPassword: string) => {
    await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), newPassword }),
    });
    addToast(
      'Password updated',
      `Your password for ${email.trim()} has been updated. You can now sign in.`,
      'success'
    );
  };

  const logout = async () => {
    if (auth.currentUser) {
      await firebaseSignOut(auth).catch(() => undefined);
    }
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setCurrentUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      sessionStorage.setItem('buildflow_active_screen', 'landing');
    } catch {
      // ignore
    }
    setScreenState('landing');
    addToast('Signed out', 'Your workspace session has been closed.');
  };

  // Product CRUD
  const saveProduct = async (
    productData: Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => {
    const isUpdate = Boolean(productData.id && products.some((p) => p.id === productData.id));
    if (isUpdate && productData.id) {
      const res = await apiFetch<{ product: Product }>(`/api/products/${productData.id}`, {
        method: 'PUT',
        body: JSON.stringify(productData),
      });
      setProducts((prev) => prev.map((p) => (p.id === res.product.id ? res.product : p)));
      addToast(
        'Material updated',
        `${res.product.name} (${res.product.sku}) updated in database.`,
        'success'
      );
    } else {
      const res = await apiFetch<{ product: Product; movements?: StockMovement[] }>(
        '/api/products',
        {
          method: 'POST',
          body: JSON.stringify(productData),
        }
      );
      setProducts((prev) => [res.product, ...prev]);
      if (Array.isArray(res.movements)) setMovements(res.movements);
      addToast(
        'Material added to catalogue',
        `${res.product.name} (${res.product.sku}) saved to database.`,
        'success'
      );
    }
  };

  const deleteProduct = async (productId: string) => {
    const target = products.find((p) => p.id === productId);
    await apiFetch(`/api/products/${productId}`, { method: 'DELETE' });
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    addToast(
      'Material removed',
      `${target?.name || 'Product'} has been removed from the catalogue.`,
      'success'
    );
  };

  const adjustStockQuantity = async (
    productId: string,
    quantityDelta: number,
    reason: string
  ) => {
    if (quantityDelta === 0) throw new Error('Quantity adjustment cannot be zero.');
    const type = quantityDelta > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_SUB';
    const quantity = Math.abs(quantityDelta);

    const res = await apiFetch<{ product: Product; movement: StockMovement }>(
      '/api/inventory/adjust',
      {
        method: 'POST',
        body: JSON.stringify({
          productId,
          type,
          quantity,
          reason,
        }),
      }
    );

    setProducts((prev) => prev.map((p) => (p.id === res.product.id ? res.product : p)));
    setMovements((prev) => [res.movement, ...prev]);
    addToast(
      'Stock level adjusted',
      `${res.product.name}: ${res.movement.previousStock} → ${res.movement.newStock} ${res.product.unit}`,
      'success'
    );

    if (res.product.quantity <= res.product.minStockLevel) {
      addToast(
        res.product.quantity <= 0 ? 'Critical Out-of-Stock Alert' : 'Low Stock Alert Triggered',
        `${res.product.name} (${res.product.sku}) is at ${res.product.quantity} ${res.product.unit} (minimum threshold: ${res.product.minStockLevel}).`,
        'warning'
      );
    }
  };

  const recordPurchase = async (input: {
    supplierId: string;
    productId?: string;
    quantity?: number;
    unitPrice?: number;
    items?: Array<{ productId: string; quantity: number; unitPrice: number }>;
    taxRate?: number;
    paymentStatus: PaymentStatus;
    amountPaid?: number;
    notes: string;
  }): Promise<PurchaseOrder> => {
    const res = await apiFetch<{
      purchase: PurchaseOrder;
      products: Product[];
      movements: StockMovement[];
      payments: PaymentRecord[];
    }>('/api/purchases', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    setPurchases((prev) => [res.purchase, ...prev]);
    if (Array.isArray(res.products)) setProducts(res.products);
    if (Array.isArray(res.movements)) setMovements(res.movements);
    if (Array.isArray(res.payments)) setPayments(res.payments);

    addToast(
      `Purchase ${res.purchase.poNumber} recorded`,
      `+${res.purchase.quantity} units added across inward purchase (${formatCurrency(
        res.purchase.totalAmount,
        settings.currencySymbol
      )}).`,
      'success'
    );
    return res.purchase;
  };

  const completeSale = async (input: {
    customerId: string;
    cartItems: SaleCartItem[];
    discountAmount: number;
    taxRate?: number;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    amountPaid?: number;
    notes: string;
    idempotencyKey?: string;
  }): Promise<SaleInvoice> => {
    const res = await apiFetch<{
      invoice: SaleInvoice;
      products: Product[];
      customers: Customer[];
      movements: StockMovement[];
      payments: PaymentRecord[];
    }>('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        customerId: input.customerId,
        items: input.cartItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        discountAmount: input.discountAmount,
        taxRate: input.taxRate,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        amountPaid: input.amountPaid,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey || `idem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      }),
    });

    setSales((prev) => [res.invoice, ...prev.filter((s) => s.id !== res.invoice.id)]);
    if (Array.isArray(res.products)) setProducts(res.products);
    if (Array.isArray(res.customers)) setCustomers(res.customers);
    if (Array.isArray(res.movements)) setMovements(res.movements);
    if (Array.isArray(res.payments)) setPayments(res.payments);
    setSelectedInvoice(res.invoice);

    addToast(
      `Invoice ${res.invoice.invoiceNumber} generated`,
      `Sale completed (${formatCurrency(res.invoice.grandTotal, settings.currencySymbol)}). Stock deducted.`,
      'success'
    );

    if (Array.isArray(res.products)) {
      const newlyFlagged = res.products.filter(
        (p) =>
          input.cartItems.some((ci) => ci.productId === p.id) &&
          p.quantity <= p.minStockLevel
      );
      if (newlyFlagged.length > 0) {
        addToast(
          `Low Stock Alert (${newlyFlagged.length} ${newlyFlagged.length === 1 ? 'SKU' : 'SKUs'})`,
          `${newlyFlagged.map((p) => `${p.name} (${p.quantity}/${p.minStockLevel})`).join(', ')} fell below threshold.`,
          'warning'
        );
      }
    }

    return res.invoice;
  };

  const recordPayment = async (input: {
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    notes?: string;
  }) => {
    const res = await apiFetch<{
      payment: PaymentRecord;
      updatedInvoice?: SaleInvoice;
      sales: SaleInvoice[];
      customers: Customer[];
      payments: PaymentRecord[];
    }>('/api/payments', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (Array.isArray(res.sales)) setSales(res.sales);
    if (Array.isArray(res.customers)) setCustomers(res.customers);
    if (Array.isArray(res.payments)) setPayments(res.payments);
    if (res.updatedInvoice) {
      setSelectedInvoiceState((prev) =>
        prev && prev.id === res.updatedInvoice!.id ? res.updatedInvoice! : prev
      );
    }

    addToast(
      `Payment ${res.payment.paymentNumber} recorded`,
      `${formatCurrency(res.payment.amount, settings.currencySymbol)} applied to ${res.payment.invoiceNumber || res.payment.referenceNumber || 'invoice'}.`,
      'success'
    );
  };

  const saveSupplier = async (
    supplierData: Omit<Supplier, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => {
    const isUpdate = Boolean(supplierData.id && suppliers.some((s) => s.id === supplierData.id));
    if (isUpdate && supplierData.id) {
      const res = await apiFetch<{ supplier: Supplier }>(`/api/suppliers/${supplierData.id}`, {
        method: 'PUT',
        body: JSON.stringify(supplierData),
      });
      setSuppliers((prev) => prev.map((s) => (s.id === res.supplier.id ? res.supplier : s)));
      addToast('Supplier updated', res.supplier.name, 'success');
    } else {
      const res = await apiFetch<{ supplier: Supplier }>('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify(supplierData),
      });
      setSuppliers((prev) => [res.supplier, ...prev]);
      addToast('Supplier added', res.supplier.name, 'success');
    }
  };

  const deleteSupplier = async (supplierId: string) => {
    await apiFetch(`/api/suppliers/${supplierId}`, { method: 'DELETE' });
    setSuppliers((prev) => prev.filter((s) => s.id !== supplierId));
    addToast('Supplier removed', 'Supplier record deleted.', 'success');
  };

  const saveCustomer = async (
    customerData: Omit<Customer, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => {
    const isUpdate = Boolean(customerData.id && customers.some((c) => c.id === customerData.id));
    if (isUpdate && customerData.id) {
      const res = await apiFetch<{ customer: Customer }>(`/api/customers/${customerData.id}`, {
        method: 'PUT',
        body: JSON.stringify(customerData),
      });
      setCustomers((prev) => prev.map((c) => (c.id === res.customer.id ? res.customer : c)));
      addToast('Customer updated', res.customer.company, 'success');
    } else {
      const res = await apiFetch<{ customer: Customer }>('/api/customers', {
        method: 'POST',
        body: JSON.stringify(customerData),
      });
      setCustomers((prev) => [res.customer, ...prev]);
      addToast('Customer added', res.customer.company, 'success');
    }
  };

  const deleteCustomer = async (customerId: string) => {
    await apiFetch(`/api/customers/${customerId}`, { method: 'DELETE' });
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    addToast('Customer removed', 'Customer account deleted.', 'success');
  };

  const saveTeamMember = async (
    memberData: Omit<TeamMember, 'uid' | 'createdAt' | 'updatedAt'> & {
      uid?: string;
      password?: string;
    }
  ) => {
    const isUpdate = Boolean(memberData.uid && team.some((m) => m.uid === memberData.uid));
    if (isUpdate && memberData.uid) {
      const res = await apiFetch<{ member: TeamMember }>(`/api/team/${memberData.uid}`, {
        method: 'PUT',
        body: JSON.stringify(memberData),
      });
      setTeam((prev) => prev.map((m) => (m.uid === res.member.uid ? res.member : m)));
      addToast(
        'Team member updated',
        `${res.member.name} (${res.member.role})`,
        'success'
      );
    } else {
      const res = await apiFetch<{ member: TeamMember }>('/api/team', {
        method: 'POST',
        body: JSON.stringify(memberData),
      });
      setTeam((prev) => [...prev, res.member]);
      addToast(
        'Team member invited',
        `${res.member.name} (${res.member.role})`,
        'success'
      );
    }
  };

  const deleteTeamMember = async (uid: string) => {
    await apiFetch(`/api/team/${uid}`, { method: 'DELETE' });
    setTeam((prev) => prev.filter((m) => m.uid !== uid));
    addToast('Team member removed', 'Access permissions revoked.', 'success');
  };

  const saveBusinessSettings = async (
    newSettings: Omit<BusinessSettings, 'id' | 'ownerId' | 'updatedAt'>
  ) => {
    const res = await apiFetch<{ settings: BusinessSettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(newSettings),
    });
    setSettings(res.settings);
    addToast('Settings saved', 'Business configuration and GST/tax rules updated.', 'success');
  };

  const resetToSeedData = async () => {
    await apiFetch('/api/reset', { method: 'POST' });
    await refreshData();
    addToast('Workspace cleared', 'All operational records have been cleared cleanly.', 'success');
  };

  return (
    <StoreContext.Provider
      value={{
        screen,
        setScreen,
        currentUser,
        authLoading,
        products,
        suppliers,
        customers,
        purchases,
        sales,
        payments,
        movements,
        team,
        settings,
        dbStatus,
        dashboardPeriod,
        setDashboardPeriod,
        editingProduct,
        setEditingProduct,
        selectedInvoice,
        setSelectedInvoice,
        globalSearch,
        setGlobalSearch,
        categoryFilterFromHero,
        setCategoryFilterFromHero,
        inventoryFilterPreset,
        setInventoryFilterPreset,
        toasts,
        addToast,
        removeToast,
        refreshData,
        loginWithGoogle,
        loginWithCredentials,
        registerAccount,
        resetPasswordWithEmail,
        logout,
        saveProduct,
        deleteProduct,
        adjustStockQuantity,
        recordPurchase,
        completeSale,
        recordPayment,
        saveSupplier,
        deleteSupplier,
        saveCustomer,
        deleteCustomer,
        saveTeamMember,
        deleteTeamMember,
        saveBusinessSettings,
        resetToSeedData,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return ctx;
}
