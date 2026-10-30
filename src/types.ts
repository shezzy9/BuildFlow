export type MaterialCategory =
  | 'Cement'
  | 'Steel'
  | 'Bricks'
  | 'Pipes'
  | 'Timber'
  | 'Aggregates';

export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

export type PaymentStatus = 'Paid' | 'Partial' | 'Pending';

export type PaymentMethod = 'Bank Transfer' | 'Card' | 'Cash' | 'UPI' | 'Credit Account';

export type UserRole = 'Admin' | 'Store Manager' | 'Inventory Clerk' | 'Billing Executive';

export type DatePeriodFilter = 'all' | '30d' | '7d' | 'today';

export type AppScreen =
  | 'landing'
  | 'login'
  | 'dashboard'
  | 'products'
  | 'product-form'
  | 'inventory'
  | 'purchase-entry'
  | 'purchase-history'
  | 'pos-billing'
  | 'invoice-detail'
  | 'sales-history'
  | 'suppliers'
  | 'customers'
  | 'reports'
  | 'team'
  | 'settings';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: MaterialCategory;
  subCategory?: string;
  description?: string;
  specification: string;
  unit: string;
  quantity: number;
  minStockLevel: number;
  purchasePrice: number;
  sellingPrice: number;
  imageUrl?: string;
  supplierId: string;
  supplierName: string;
  location: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  company?: string;
  code: string;
  contactPerson: string;
  phone: string;
  email: string;
  address?: string;
  city: string;
  gstin?: string;
  category: string;
  leadTimeDays: number;
  rating: number;
  notes?: string;
  status: 'Active' | 'On Hold';
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address?: string;
  billingAddress?: string;
  city: string;
  gstOrTaxId: string;
  creditLimit: number;
  outstandingBalance: number;
  tier: 'Contractor' | 'Architectural Firm' | 'Developer' | 'Retail' | 'Walk-In Trade';
  notes?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  purchaseNumber?: string;
  date?: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal?: number;
  taxRate?: number;
  taxAmount: number;
  totalAmount: number;
  totalCost?: number;
  amountPaid?: number;
  balanceDue?: number;
  paymentStatus: PaymentStatus;
  items?: PurchaseItem[];
  itemsSummary?: string;
  notes: string;
  status: 'received' | 'completed';
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleCartItem {
  productId: string;
  productName: string;
  sku: string;
  category: MaterialCategory;
  unit: string;
  quantity: number;
  availableStock?: number;
  unitPrice: number;
  lineTotal: number;
}

export type SaleLineItem = SaleCartItem;

export interface SaleInvoice {
  id: string;
  invoiceNumber: string;
  date?: string;
  customerId: string;
  customerName: string;
  customerCompany: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  primaryProductId: string;
  primaryProductName: string;
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  amountPaid?: number;
  balanceDue?: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  notes: string;
  itemsSummary: string;
  items?: SaleCartItem[];
  status: 'issued' | 'completed';
  createdByName?: string;
  idempotencyKey?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  paymentNumber: string;
  referenceType?: 'SALE' | 'PURCHASE';
  referenceId?: string;
  referenceNumber?: string;
  partyId?: string;
  partyName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  customerId?: string;
  purchaseId?: string;
  poNumber?: string;
  supplierId?: string;
  type?: 'INCOMING_SALE' | 'OUTGOING_PURCHASE';
  amount: number;
  paymentMethod?: PaymentMethod;
  method?: PaymentMethod;
  reference?: string;
  notes: string;
  recordedBy: string;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  type: 'OPENING' | 'IN_PURCHASE' | 'OUT_SALE' | 'ADJUSTMENT' | 'ADJUSTMENT_ADD' | 'ADJUSTMENT_SUB';
  quantityDelta: number;
  previousStock: number;
  newStock: number;
  referenceNumber: string;
  reason: string;
  ownerId: string;
  createdAt: string;
}

export interface TeamMember {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  department: string;
  status: 'Active' | 'Suspended' | 'On Leave';
  createdAt: string;
  updatedAt: string;
}

export interface BusinessSettings {
  id: string;
  businessName: string;
  legalName: string;
  taxRegistrationNumber: string;
  currencySymbol: string;
  currencyCode?: string;
  defaultTaxRate: number;
  invoicePrefix: string;
  warehouseAddress: string;
  contactEmail: string;
  contactPhone: string;
  lowStockGlobalThreshold: number;
  ownerId: string;
  updatedAt: string;
}

export interface DatabaseStatusInfo {
  connectedToAtlas: boolean;
  engine: 'mongodb_atlas' | 'server_persistent_store' | 'persistent_local_json' | 'firebase_firestore';
  dbName?: string;
  databaseName?: string;
  transactionsSupported: boolean;
  missingSecrets: string[];
  message: string;
}
