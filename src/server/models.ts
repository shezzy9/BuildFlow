import mongoose, { Schema } from 'mongoose';

// 1. User Schema
const UserSchema = new Schema(
  {
    uid: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, default: '' },
    role: {
      type: String,
      enum: ['Admin', 'Store Manager', 'Inventory Clerk', 'Billing Executive'],
      default: 'Store Manager',
    },
    department: { type: String, default: 'Operations' },
    status: { type: String, enum: ['Active', 'On Leave', 'Suspended'], default: 'Active' },
  },
  { timestamps: true }
);

// 2. Product Schema
const ProductSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    category: {
      type: String,
      enum: ['Bricks', 'Cement', 'Steel', 'Pipes', 'Timber', 'Aggregates'],
      required: true,
      index: true,
    },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    minStockLevel: { type: Number, required: true, min: 0, default: 10 },
    purchasePrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    supplierId: { type: String, required: true, index: true },
    supplierName: { type: String, required: true },
    location: { type: String, default: 'Yard Bay A-01' },
    specification: { type: String, default: '' },
    description: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    ownerId: { type: String, default: 'workspace_owner' },
  },
  { timestamps: true }
);

// 3. Supplier Schema
const SupplierSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, unique: true, trim: true },
    contactPerson: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    city: { type: String, required: true },
    address: { type: String, default: '' },
    gstin: { type: String, default: '' },
    category: {
      type: String,
      enum: ['Bricks', 'Cement', 'Steel', 'Pipes', 'Timber', 'Aggregates'],
      required: true,
    },
    leadTimeDays: { type: Number, default: 3, min: 0 },
    rating: { type: Number, default: 4.8, min: 0, max: 5 },
    status: { type: String, enum: ['Active', 'On Hold'], default: 'Active' },
    notes: { type: String, default: '' },
    ownerId: { type: String, default: 'workspace_owner' },
  },
  { timestamps: true }
);

// 4. Customer Schema
const CustomerSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true, index: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    city: { type: String, required: true },
    address: { type: String, default: '' },
    gstOrTaxId: { type: String, default: '' },
    creditLimit: { type: Number, default: 500000, min: 0 },
    outstandingBalance: { type: Number, default: 0 },
    tier: {
      type: String,
      enum: ['Contractor', 'Architectural Firm', 'Developer', 'Walk-In Trade'],
      default: 'Contractor',
    },
    notes: { type: String, default: '' },
    ownerId: { type: String, default: 'workspace_owner' },
  },
  { timestamps: true }
);

// 5 & 6. PurchaseItem & Purchase Schemas
const PurchaseItemSchema = new Schema(
  {
    purchaseId: { type: String, index: true },
    productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    unit: { type: String, default: 'Unit' },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const PurchaseSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    poNumber: { type: String, required: true, unique: true, index: true },
    supplierId: { type: String, required: true, index: true },
    supplierName: { type: String, required: true },
    productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 18, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    paymentStatus: { type: String, enum: ['Paid', 'Pending', 'Partial'], default: 'Paid' },
    items: { type: [PurchaseItemSchema], default: [] },
    itemsSummary: { type: String, default: '[]' },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['received', 'ordered', 'completed'], default: 'completed' },
    ownerId: { type: String, default: 'workspace_owner' },
  },
  { timestamps: true }
);

// 7 & 8. SaleItem & Sale Schemas
const SaleItemSchema = new Schema(
  {
    saleId: { type: String, index: true },
    productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    category: { type: String, default: 'Cement' },
    unit: { type: String, default: 'Unit' },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const SaleSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    customerCompany: { type: String, required: true },
    primaryProductId: { type: String, required: true },
    primaryProductName: { type: String, required: true },
    itemCount: { type: Number, required: true, min: 1 },
    totalQuantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['Bank Transfer', 'Card', 'Cash', 'Credit Account', 'UPI'],
      default: 'Bank Transfer',
    },
    paymentStatus: { type: String, enum: ['Paid', 'Pending', 'Partial'], default: 'Paid' },
    notes: { type: String, default: '' },
    items: { type: [SaleItemSchema], default: [] },
    itemsSummary: { type: String, required: true },
    idempotencyKey: { type: String, index: true },
    status: { type: String, enum: ['completed', 'issued'], default: 'completed' },
    ownerId: { type: String, default: 'workspace_owner' },
  },
  { timestamps: true }
);

// 9. Invoice Schema
const InvoiceSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    saleId: { type: String, required: true, index: true },
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    customerCompany: { type: String, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    paymentMethod: { type: String, required: true },
    paymentStatus: { type: String, enum: ['Paid', 'Pending', 'Partial'], default: 'Paid' },
    items: { type: [SaleItemSchema], default: [] },
    itemsSummary: { type: String, required: true },
    notes: { type: String, default: '' },
    issuedAt: { type: String, required: true },
  },
  { timestamps: true }
);

// 10. Payment Schema
const PaymentSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    paymentNumber: { type: String, required: true, unique: true, index: true },
    invoiceId: { type: String, index: true },
    invoiceNumber: { type: String, index: true },
    purchaseId: { type: String, index: true },
    poNumber: { type: String, index: true },
    customerId: { type: String, index: true },
    supplierId: { type: String, index: true },
    partyName: { type: String, required: true },
    type: { type: String, enum: ['INCOMING_SALE', 'OUTGOING_PURCHASE'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: {
      type: String,
      enum: ['Bank Transfer', 'Card', 'Cash', 'Credit Account', 'UPI'],
      default: 'Bank Transfer',
    },
    reference: { type: String, default: '' },
    notes: { type: String, default: '' },
    recordedBy: { type: String, default: 'System' },
  },
  { timestamps: true }
);

// 11. StockMovement Schema
const StockMovementSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['IN_PURCHASE', 'OUT_SALE', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB'],
      required: true,
      index: true,
    },
    quantityDelta: { type: Number, required: true },
    previousStock: { type: Number, required: true, min: 0 },
    newStock: { type: Number, required: true, min: 0 },
    referenceNumber: { type: String, required: true, index: true },
    reason: { type: String, required: true },
    ownerId: { type: String, default: 'workspace_owner' },
  },
  { timestamps: true }
);

// 12. BusinessSettings Schema
const BusinessSettingsSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, default: 'default_settings' },
    businessName: { type: String, required: true },
    legalName: { type: String, required: true },
    taxRegistrationNumber: { type: String, required: true },
    currencySymbol: { type: String, default: '₹' },
    defaultTaxRate: { type: Number, default: 18, min: 0, max: 100 },
    invoicePrefix: { type: String, default: 'BFS-2026-' },
    warehouseAddress: { type: String, required: true },
    contactEmail: { type: String, required: true },
    contactPhone: { type: String, required: true },
    lowStockGlobalThreshold: { type: Number, default: 35, min: 0 },
    ownerId: { type: String, default: 'workspace_owner' },
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
export const ProductModel = mongoose.models.Product || mongoose.model('Product', ProductSchema);
export const SupplierModel = mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema);
export const CustomerModel = mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);
export const PurchaseItemModel =
  mongoose.models.PurchaseItem || mongoose.model('PurchaseItem', PurchaseItemSchema);
export const PurchaseModel = mongoose.models.Purchase || mongoose.model('Purchase', PurchaseSchema);
export const SaleItemModel = mongoose.models.SaleItem || mongoose.model('SaleItem', SaleItemSchema);
export const SaleModel = mongoose.models.Sale || mongoose.model('Sale', SaleSchema);
export const InvoiceModel = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
export const PaymentModel = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);
export const StockMovementModel =
  mongoose.models.StockMovement || mongoose.model('StockMovement', StockMovementSchema);
export const BusinessSettingsModel =
  mongoose.models.BusinessSettings || mongoose.model('BusinessSettings', BusinessSettingsSchema);
