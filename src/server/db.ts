import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import type {
  BusinessSettings,
  Customer,
  DatabaseStatusInfo,
  PaymentRecord,
  Product,
  PurchaseItem,
  PurchaseOrder,
  SaleInvoice,
  SaleLineItem,
  StockMovement,
  Supplier,
  TeamMember,
  UserRole,
} from "../types.ts";
import {
  BusinessSettingsModel,
  CustomerModel,
  InvoiceModel,
  PaymentModel,
  ProductModel,
  PurchaseModel,
  SaleModel,
  StockMovementModel,
  SupplierModel,
  UserModel,
} from "./models.ts";
import {
  calculateInvoiceTotals,
  calculatePurchaseTotals,
} from "../utils/inventoryLogic.ts";

export interface StoredUser extends TeamMember {
  passwordHash: string;
}

interface DiskStoreData {
  users: StoredUser[];
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  purchases: PurchaseOrder[];
  sales: SaleInvoice[];
  payments: PaymentRecord[];
  movements: StockMovement[];
  settings: BusinessSettings;
}

const DATA_DIR = path.resolve(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "buildflow_supply.json");

let isAtlasConnected = false;
let transactionsSupported = false;
let diskStore: DiskStoreData | null = null;

// Concurrency write lock so concurrent requests cannot interleave stock checks and deductions
let writeQueue: Promise<unknown> = Promise.resolve();
export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function getMissingSecrets(): string[] {
  const required = [
    "MONGODB_URI",
    "JWT_SECRET",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
  ];
  return required.filter((key) => {
    const val = process.env[key]?.trim();
    if (!val || val.startsWith("MY_")) return true;
    if (
      key === "MONGODB_URI" &&
      !val.startsWith("mongodb://") &&
      !val.startsWith("mongodb+srv://")
    ) {
      return true;
    }
    return false;
  });
}

export function getAdminCredentials() {
  const email = (
    process.env.ADMIN_EMAIL && !process.env.ADMIN_EMAIL.startsWith("MY_")
      ? process.env.ADMIN_EMAIL
      : "admin@buildflowsupply.com"
  )
    .trim()
    .toLowerCase();

  const password =
    process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD.startsWith("MY_")
      ? process.env.ADMIN_PASSWORD
      : "BuildFlow@2026";

  return { email, password };
}

export function getJwtSecret(): string {
  if (process.env.JWT_SECRET && !process.env.JWT_SECRET.startsWith("MY_")) {
    return process.env.JWT_SECRET;
  }
  return "buildflow_supply_server_jwt_secret_key_2026";
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  id: "default_settings",
  businessName: "BuildFlow Supply",
  legalName: "BuildFlow Architectural Materials Pvt. Ltd.",
  taxRegistrationNumber: "29AAACB8921F1Z5",
  currencySymbol: "₹",
  currencyCode: "INR",
  defaultTaxRate: 18,
  invoicePrefix: "BFS-INV-",
  warehouseAddress:
    "Plot 14, Industrial Material Yard, Peenya Stage II, Bengaluru 560058",
  contactEmail: "dispatch@buildflowsupply.com",
  contactPhone: "+91 80 4120 9900",
  lowStockGlobalThreshold: 30,
  ownerId: "workspace_owner",
  updatedAt: new Date().toISOString(),
};

const LEGACY_SEEDED_PRODUCT_IDS = new Set([
  "prod_cement_opc53",
  "prod_cement_white",
  "prod_steel_rebar16",
  "prod_steel_mesh",
  "prod_brick_terracotta",
  "prod_brick_cmu",
  "prod_pipe_upvc110",
  "prod_pipe_hdpe63",
  "prod_timber_c24",
  "prod_timber_ply18",
]);

const LEGACY_SEEDED_SUPPLIER_IDS = new Set([
  "sup_holcim",
  "sup_arcelor",
  "sup_ibstock",
  "sup_wavin",
  "sup_stora",
]);

const LEGACY_SEEDED_CUSTOMER_IDS = new Set([
  "cust_vanguard",
  "cust_kengo",
  "cust_meridian",
  "cust_atelier",
]);

const LEGACY_SEEDED_USER_UIDS = new Set([
  "usr_mgr_02",
  "usr_clk_03",
  "usr_bil_04",
  "usr_clk_05",
]);

function buildInitialUsers(): StoredUser[] {
  const { email: adminEmail, password: adminPassword } = getAdminCredentials();
  const adminHash = bcrypt.hashSync(adminPassword, 10);
  const now = new Date().toISOString();

  return [
    {
      uid: "usr_admin_01",
      name: "Workspace Administrator",
      email: adminEmail,
      phone: "+91 80 4120 9900",
      role: "Admin",
      department: "Executive & Yard Operations",
      status: "Active",
      passwordHash: adminHash,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function loadDiskStore(): DiskStoreData {
  if (diskStore) return diskStore;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(raw) as DiskStoreData;

      // Strip out any legacy pre-seeded dummy records if present
      const hadSeededProducts =
        Array.isArray(parsed.products) &&
        parsed.products.some((p) => LEGACY_SEEDED_PRODUCT_IDS.has(p.id));

      if (hadSeededProducts) {
        parsed.products = (parsed.products || []).filter(
          (p) => !LEGACY_SEEDED_PRODUCT_IDS.has(p.id),
        );
        parsed.suppliers = (parsed.suppliers || []).filter(
          (s) => !LEGACY_SEEDED_SUPPLIER_IDS.has(s.id),
        );
        parsed.customers = (parsed.customers || []).filter(
          (c) => !LEGACY_SEEDED_CUSTOMER_IDS.has(c.id),
        );
        parsed.purchases = (parsed.purchases || []).filter(
          (po) => !po.id.startsWith("po_108"),
        );
        parsed.sales = (parsed.sales || []).filter(
          (s) => !s.id.startsWith("inv_20"),
        );
        parsed.payments = (parsed.payments || []).filter(
          (pay) => !pay.id.startsWith("pay_init_"),
        );
        parsed.movements = (parsed.movements || []).filter(
          (m) => !m.id.startsWith("mov_init_"),
        );
      }

      parsed.users = (parsed.users || []).filter(
        (u) => !LEGACY_SEEDED_USER_UIDS.has(u.uid),
      );

      const { email: adminEmail, password: adminPassword } =
        getAdminCredentials();
      const existingAdmin = parsed.users.find(
        (u) => u.email.toLowerCase() === adminEmail,
      );
      if (!existingAdmin) {
        parsed.users.unshift({
          uid: "usr_admin_01",
          name: "Workspace Administrator",
          email: adminEmail,
          phone: "+91 80 4120 9900",
          role: "Admin",
          department: "Executive & Yard Operations",
          status: "Active",
          passwordHash: bcrypt.hashSync(adminPassword, 10),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      if (!Array.isArray(parsed.products)) parsed.products = [];
      if (!Array.isArray(parsed.suppliers)) parsed.suppliers = [];
      if (!Array.isArray(parsed.customers)) parsed.customers = [];
      if (!Array.isArray(parsed.purchases)) parsed.purchases = [];
      if (!Array.isArray(parsed.sales)) parsed.sales = [];
      if (!Array.isArray(parsed.payments)) parsed.payments = [];
      if (!Array.isArray(parsed.movements)) parsed.movements = [];
      if (!parsed.settings) parsed.settings = { ...DEFAULT_BUSINESS_SETTINGS };

      diskStore = parsed;
      saveDiskStore();
      return diskStore;
    } catch (err) {
      console.error(
        "Error reading .data/buildflow_supply.json, initializing clean store:",
        err,
      );
    }
  }

  diskStore = {
    users: buildInitialUsers(),
    products: [],
    suppliers: [],
    customers: [],
    purchases: [],
    sales: [],
    payments: [],
    movements: [],
    settings: { ...DEFAULT_BUSINESS_SETTINGS },
  };
  saveDiskStore();
  return diskStore;
}

function saveDiskStore() {
  if (!diskStore) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(diskStore, null, 2), "utf-8");
  fs.renameSync(tmpFile, DATA_FILE);
}

export async function initDatabase(): Promise<DatabaseStatusInfo> {
  const uri = process.env.MONGODB_URI?.trim();

  if (
    uri &&
    (uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://"))
  ) {
    try {
      await mongoose.connect(uri, {
        dbName: "buildflow_supply",
        serverSelectionTimeoutMS: 8000,
      });
      isAtlasConnected = true;

      try {
        const session = await mongoose.startSession();
        session.startTransaction();
        await session.abortTransaction();
        session.endSession();
        transactionsSupported = true;
      } catch {
        transactionsSupported = false;
      }

      await ensureAtlasInitialized();
      return getDatabaseStatus();
    } catch (err) {
      console.error(
        "MongoDB Atlas connection failed, falling back to persistent server storage:",
        err,
      );
      isAtlasConnected = false;
    }
  }

  loadDiskStore();
  return getDatabaseStatus();
}

async function ensureAtlasInitialized() {
  const initialUsers = buildInitialUsers();

  for (const u of initialUsers) {
    await UserModel.updateOne(
      { email: u.email },
      { $setOnInsert: u },
      {
        upsert: true,
        timestamps: false,
      },
    );
  }

  await BusinessSettingsModel.updateOne(
    { id: "default_settings" },
    { $setOnInsert: DEFAULT_BUSINESS_SETTINGS },
    {
      upsert: true,
      timestamps: false,
    },
  );
}

export function getDatabaseStatus(): DatabaseStatusInfo {
  const missing = getMissingSecrets();
  if (isAtlasConnected) {
    return {
      connectedToAtlas: true,
      databaseName: "buildflow_supply",
      engine: "mongodb_atlas",
      transactionsSupported,
      missingSecrets: missing,
      message: "Connected to MongoDB Atlas (buildflow_supply)",
    };
  }
  return {
    connectedToAtlas: false,
    databaseName: "buildflow_supply",
    engine: "persistent_local_json",
    transactionsSupported: true,
    missingSecrets: missing,
    message:
      missing.length > 0
        ? `Running on persistent server storage (.data/buildflow_supply.json). Add ${missing.join(", ")} in AI Studio Secrets to connect live MongoDB Atlas.`
        : "Running on persistent server storage (.data/buildflow_supply.json).",
  };
}

function stripMongoDoc<T>(doc: any): T {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete obj._id;
  delete obj.__v;
  if (obj.createdAt instanceof Date)
    obj.createdAt = obj.createdAt.toISOString();
  if (obj.updatedAt instanceof Date)
    obj.updatedAt = obj.updatedAt.toISOString();
  return obj as T;
}

export const dbRepo = {
  // AUTH & USERS
  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const cleanEmail = email.trim().toLowerCase();
    if (isAtlasConnected) {
      const doc = await UserModel.findOne({ email: cleanEmail }).lean();
      return doc ? stripMongoDoc<StoredUser>(doc) : null;
    }
    const store = loadDiskStore();
    return (
      store.users.find((u) => u.email.toLowerCase() === cleanEmail) || null
    );
  },

  async registerUser(input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: UserRole;
    department?: string;
    businessName?: string;
  }): Promise<StoredUser> {
    return withWriteLock(async () => {
      const cleanEmail = input.email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes("@")) {
        throw new Error("Please enter a valid work email address.");
      }
      if (!input.name?.trim()) {
        throw new Error("Full name is required.");
      }
      if (!input.password || input.password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      const now = new Date().toISOString();
      const newUser: StoredUser = {
        uid: `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        name: input.name.trim(),
        email: cleanEmail,
        phone: (input.phone || "+91 80 4120 9900").trim(),
        role: input.role || "Admin",
        department: (input.department || "Executive & Yard Operations").trim(),
        status: "Active",
        passwordHash: bcrypt.hashSync(input.password, 10),
        createdAt: now,
        updatedAt: now,
      };

      if (isAtlasConnected) {
        const exists = await UserModel.findOne({ email: cleanEmail }).lean();
        if (exists) {
          throw new Error(
            `An account with email "${cleanEmail}" already exists. Please sign in.`,
          );
        }
        await UserModel.create(newUser);
        if (input.businessName?.trim()) {
          await BusinessSettingsModel.findOneAndUpdate(
            { id: "default_settings" },
            {
              $set: {
                businessName: input.businessName.trim(),
                contactEmail: cleanEmail,
                updatedAt: now,
              },
            },
            { upsert: true },
          );
        }
        return newUser;
      }

      const store = loadDiskStore();
      if (store.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        throw new Error(
          `An account with email "${cleanEmail}" already exists. Please sign in.`,
        );
      }
      store.users.unshift(newUser);
      if (input.businessName?.trim()) {
        store.settings = {
          ...store.settings,
          businessName: input.businessName.trim(),
          contactEmail: cleanEmail,
          updatedAt: now,
        };
      }
      saveDiskStore();
      return newUser;
    });
  },

  async upsertGoogleUser(input: {
    uid: string;
    email: string;
    name: string;
  }): Promise<StoredUser> {
    return withWriteLock(async () => {
      const cleanEmail = input.email.trim().toLowerCase();
      const now = new Date().toISOString();

      if (isAtlasConnected) {
        const existing = await UserModel.findOne({ email: cleanEmail }).lean();
        if (existing) return stripMongoDoc<StoredUser>(existing);
        const created: StoredUser = {
          uid: input.uid || `usr_goog_${Date.now().toString(36)}`,
          name: input.name || cleanEmail.split("@")[0],
          email: cleanEmail,
          phone: "",
          role: "Admin",
          department: "Executive & Yard Operations",
          status: "Active",
          passwordHash: bcrypt.hashSync(`google_oauth_${Date.now()}`, 10),
          createdAt: now,
          updatedAt: now,
        };
        await UserModel.create(created);
        return created;
      }

      const store = loadDiskStore();
      const existing = store.users.find(
        (u) => u.email.toLowerCase() === cleanEmail,
      );
      if (existing) return existing;
      const created: StoredUser = {
        uid: input.uid || `usr_goog_${Date.now().toString(36)}`,
        name: input.name || cleanEmail.split("@")[0],
        email: cleanEmail,
        phone: "",
        role: "Admin",
        department: "Executive & Yard Operations",
        status: "Active",
        passwordHash: bcrypt.hashSync(`google_oauth_${Date.now()}`, 10),
        createdAt: now,
        updatedAt: now,
      };
      store.users.unshift(created);
      saveDiskStore();
      return created;
    });
  },

  async resetUserPassword(email: string, newPassword: string): Promise<void> {
    return withWriteLock(async () => {
      const cleanEmail = email.trim().toLowerCase();
      if (!newPassword || newPassword.length < 6) {
        throw new Error("New password must be at least 6 characters.");
      }
      const passwordHash = bcrypt.hashSync(newPassword, 10);
      const now = new Date().toISOString();

      if (isAtlasConnected) {
        const updated = await UserModel.findOneAndUpdate(
          { email: cleanEmail },
          { $set: { passwordHash, updatedAt: now } },
          { new: true },
        ).lean();
        if (!updated) {
          throw new Error(
            `No account found for "${cleanEmail}". Please create an account first.`,
          );
        }
        return;
      }

      const store = loadDiskStore();
      const idx = store.users.findIndex(
        (u) => u.email.toLowerCase() === cleanEmail,
      );
      if (idx === -1) {
        throw new Error(
          `No account found for "${cleanEmail}". Please create an account first.`,
        );
      }
      store.users[idx] = {
        ...store.users[idx],
        passwordHash,
        updatedAt: now,
      };
      saveDiskStore();
    });
  },

  async findUserByUid(uid: string): Promise<StoredUser | null> {
    if (isAtlasConnected) {
      const doc = await UserModel.findOne({ uid }).lean();
      return doc ? stripMongoDoc<StoredUser>(doc) : null;
    }
    const store = loadDiskStore();
    return store.users.find((u) => u.uid === uid) || null;
  },

  async listTeam(): Promise<TeamMember[]> {
    if (isAtlasConnected) {
      const docs = await UserModel.find().sort({ createdAt: 1 }).lean();
      return docs.map((d) => {
        const clean = stripMongoDoc<StoredUser>(d);
        const { passwordHash: _, ...member } = clean;
        return member;
      });
    }
    const store = loadDiskStore();
    return store.users.map(({ passwordHash: _, ...member }) => member);
  },

  async createTeamMember(input: {
    name: string;
    email: string;
    phone: string;
    role: UserRole;
    department: string;
    status?: "Active" | "On Leave";
    password?: string;
  }): Promise<TeamMember> {
    return withWriteLock(async () => {
      const cleanEmail = input.email.trim().toLowerCase();
      const now = new Date().toISOString();
      const newUser: StoredUser = {
        uid: `usr_${Date.now().toString(36)}`,
        name: input.name.trim(),
        email: cleanEmail,
        phone: input.phone.trim(),
        role: input.role,
        department: input.department.trim() || "Operations",
        status: input.status || "Active",
        passwordHash: bcrypt.hashSync(input.password || "BuildFlow@2026", 10),
        createdAt: now,
        updatedAt: now,
      };

      if (isAtlasConnected) {
        const exists = await UserModel.findOne({ email: cleanEmail }).lean();
        if (exists)
          throw new Error(`A user with email "${cleanEmail}" already exists.`);
        await UserModel.create(newUser);
      } else {
        const store = loadDiskStore();
        if (store.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
          throw new Error(`A user with email "${cleanEmail}" already exists.`);
        }
        store.users.push(newUser);
        saveDiskStore();
      }

      const { passwordHash: _, ...member } = newUser;
      return member;
    });
  },

  async updateTeamMember(
    uid: string,
    updates: Partial<TeamMember> & { password?: string },
  ): Promise<TeamMember> {
    return withWriteLock(async () => {
      const now = new Date().toISOString();
      if (isAtlasConnected) {
        const updatePayload: any = { ...updates, updatedAt: now };
        if (updates.password) {
          updatePayload.passwordHash = bcrypt.hashSync(updates.password, 10);
          delete updatePayload.password;
        }
        const doc = await UserModel.findOneAndUpdate(
          { uid },
          { $set: updatePayload },
          { new: true },
        ).lean();
        if (!doc) throw new Error("Team member not found.");
        const { passwordHash: _, ...member } = stripMongoDoc<StoredUser>(doc);
        return member;
      }

      const store = loadDiskStore();
      const idx = store.users.findIndex((u) => u.uid === uid);
      if (idx === -1) throw new Error("Team member not found.");
      const updated: StoredUser = {
        ...store.users[idx],
        ...updates,
        updatedAt: now,
        passwordHash: updates.password
          ? bcrypt.hashSync(updates.password, 10)
          : store.users[idx].passwordHash,
      };
      store.users[idx] = updated;
      saveDiskStore();
      const { passwordHash: _, ...member } = updated;
      return member;
    });
  },

  async deleteTeamMember(uid: string): Promise<void> {
    return withWriteLock(async () => {
      if (isAtlasConnected) {
        await UserModel.deleteOne({ uid });
        return;
      }
      const store = loadDiskStore();
      store.users = store.users.filter((u) => u.uid !== uid);
      saveDiskStore();
    });
  },

  // PRODUCTS
  async listProducts(): Promise<Product[]> {
    if (isAtlasConnected) {
      const docs = await ProductModel.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => stripMongoDoc<Product>(d));
    }
    const store = loadDiskStore();
    return [...store.products];
  },

  async getProductById(id: string): Promise<Product | null> {
    if (isAtlasConnected) {
      const doc = await ProductModel.findOne({ id }).lean();
      return doc ? stripMongoDoc<Product>(doc) : null;
    }
    const store = loadDiskStore();
    return store.products.find((p) => p.id === id) || null;
  },

  async createProduct(
    input: Omit<Product, "id" | "ownerId" | "createdAt" | "updatedAt">,
  ): Promise<Product> {
    return withWriteLock(async () => {
      const sku = input.sku.trim().toUpperCase();
      if (!input.name.trim()) throw new Error("Product name is required.");
      if (!sku) throw new Error("Product SKU is required.");
      if (Number(input.purchasePrice) < 0 || Number(input.sellingPrice) < 0) {
        throw new Error("Product prices cannot be negative.");
      }
      if (Number(input.quantity) < 0) {
        throw new Error("Opening stock quantity cannot be negative.");
      }

      const now = new Date().toISOString();
      const newProduct: Product = {
        ...input,
        id: `prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: input.name.trim(),
        sku,
        quantity: Number(input.quantity),
        minStockLevel: Number(input.minStockLevel),
        purchasePrice: Number(input.purchasePrice),
        sellingPrice: Number(input.sellingPrice),
        ownerId: "workspace_owner",
        createdAt: now,
        updatedAt: now,
      };

      if (isAtlasConnected) {
        const duplicate = await ProductModel.findOne({ sku }).lean();
        if (duplicate)
          throw new Error(`A product with SKU "${sku}" already exists.`);
        await ProductModel.create(newProduct);
        if (newProduct.quantity > 0) {
          await StockMovementModel.create({
            id: `mov_${Date.now().toString(36)}`,
            productId: newProduct.id,
            productName: newProduct.name,
            sku: newProduct.sku,
            type: "ADJUSTMENT_ADD",
            quantityDelta: newProduct.quantity,
            previousStock: 0,
            newStock: newProduct.quantity,
            referenceNumber: `INIT-${newProduct.sku}`,
            reason: "Initial opening stock entry",
            ownerId: "workspace_owner",
            createdAt: now,
          });
        }
        return newProduct;
      }

      const store = loadDiskStore();
      if (store.products.some((p) => p.sku.toUpperCase() === sku)) {
        throw new Error(`A product with SKU "${sku}" already exists.`);
      }
      store.products.unshift(newProduct);
      if (newProduct.quantity > 0) {
        store.movements.unshift({
          id: `mov_${Date.now().toString(36)}`,
          productId: newProduct.id,
          productName: newProduct.name,
          sku: newProduct.sku,
          type: "ADJUSTMENT_ADD",
          quantityDelta: newProduct.quantity,
          previousStock: 0,
          newStock: newProduct.quantity,
          referenceNumber: `INIT-${newProduct.sku}`,
          reason: "Initial opening stock entry",
          ownerId: "workspace_owner",
          createdAt: now,
        });
      }
      saveDiskStore();
      return newProduct;
    });
  },

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    return withWriteLock(async () => {
      const now = new Date().toISOString();
      if (updates.sku) updates.sku = updates.sku.trim().toUpperCase();

      if (isAtlasConnected) {
        if (updates.sku) {
          const dup = await ProductModel.findOne({
            sku: updates.sku,
            id: { $ne: id },
          }).lean();
          if (dup)
            throw new Error(
              `Another product with SKU "${updates.sku}" already exists.`,
            );
        }
        const doc = await ProductModel.findOneAndUpdate(
          { id },
          { $set: { ...updates, updatedAt: now } },
          { new: true },
        ).lean();
        if (!doc) throw new Error("Product not found.");
        return stripMongoDoc<Product>(doc);
      }

      const store = loadDiskStore();
      const idx = store.products.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error("Product not found.");
      if (
        updates.sku &&
        store.products.some(
          (p, i) =>
            i !== idx && p.sku.toUpperCase() === updates.sku!.toUpperCase(),
        )
      ) {
        throw new Error(
          `Another product with SKU "${updates.sku}" already exists.`,
        );
      }
      const updated: Product = {
        ...store.products[idx],
        ...updates,
        updatedAt: now,
      };
      store.products[idx] = updated;
      saveDiskStore();
      return updated;
    });
  },

  async deleteProduct(id: string): Promise<void> {
    return withWriteLock(async () => {
      if (isAtlasConnected) {
        const hasPurchase = await PurchaseModel.findOne({
          $or: [{ productId: id }, { "items.productId": id }],
        }).lean();
        if (hasPurchase) {
          const err: any = new Error(
            "Cannot delete this product because it is referenced in purchase records.",
          );
          err.statusCode = 409;
          throw err;
        }
        const hasSale = await SaleModel.findOne({
          $or: [
            { primaryProductId: id },
            { "items.productId": id },
            { itemsSummary: { $regex: id } },
          ],
        }).lean();
        if (hasSale) {
          const err: any = new Error(
            "Cannot delete this product because it is referenced in sales/invoice records.",
          );
          err.statusCode = 409;
          throw err;
        }
        await ProductModel.deleteOne({ id });
        return;
      }

      const store = loadDiskStore();
      const hasPurchase = store.purchases.some(
        (po) =>
          po.productId === id ||
          (po.itemsSummary && po.itemsSummary.includes(id)),
      );
      if (hasPurchase) {
        const err: any = new Error(
          "Cannot delete this product because it is referenced in purchase records.",
        );
        err.statusCode = 409;
        throw err;
      }
      const hasSale = store.sales.some(
        (s) =>
          s.primaryProductId === id ||
          (s.itemsSummary && s.itemsSummary.includes(id)),
      );
      if (hasSale) {
        const err: any = new Error(
          "Cannot delete this product because it is referenced in sales/invoice records.",
        );
        err.statusCode = 409;
        throw err;
      }
      store.products = store.products.filter((p) => p.id !== id);
      saveDiskStore();
    });
  },

  // INVENTORY ADJUSTMENT & MOVEMENTS
  async listMovements(): Promise<StockMovement[]> {
    if (isAtlasConnected) {
      const docs = await StockMovementModel.find()
        .sort({ createdAt: -1 })
        .lean();
      return docs.map((d) => stripMongoDoc<StockMovement>(d));
    }
    const store = loadDiskStore();
    return [...store.movements];
  },

  async adjustStock(input: {
    productId: string;
    type: "ADJUSTMENT_ADD" | "ADJUSTMENT_SUB";
    quantity: number;
    reason: string;
  }): Promise<{ product: Product; movement: StockMovement }> {
    return withWriteLock(async () => {
      const qty = Math.round(Number(input.quantity));
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error("Adjustment quantity must be a positive integer.");
      }
      if (!input.reason || !input.reason.trim()) {
        throw new Error("An audit reason is required for stock adjustments.");
      }

      const now = new Date().toISOString();
      const delta = input.type === "ADJUSTMENT_ADD" ? qty : -qty;

      if (isAtlasConnected) {
        const prod = await ProductModel.findOne({ id: input.productId }).lean();
        if (!prod) throw new Error("Product not found.");
        const currentQty = Number((prod as any).quantity);
        const newStock = currentQty + delta;
        if (newStock < 0) {
          throw new Error(
            `Insufficient stock for ${(prod as any).name}. Current stock is ${currentQty}, cannot deduct ${qty}.`,
          );
        }

        const updatedDoc = await ProductModel.findOneAndUpdate(
          { id: input.productId },
          { $set: { quantity: newStock, updatedAt: now } },
          { new: true },
        ).lean();

        const movement: StockMovement = {
          id: `mov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          productId: input.productId,
          productName: (prod as any).name,
          sku: (prod as any).sku,
          type: input.type,
          quantityDelta: delta,
          previousStock: currentQty,
          newStock,
          referenceNumber: `ADJ-${Date.now().toString().slice(-5)}`,
          reason: input.reason.trim(),
          ownerId: "workspace_owner",
          createdAt: now,
        };
        await StockMovementModel.create(movement);
        return { product: stripMongoDoc<Product>(updatedDoc), movement };
      }

      const store = loadDiskStore();
      const idx = store.products.findIndex((p) => p.id === input.productId);
      if (idx === -1) throw new Error("Product not found.");
      const prod = store.products[idx];
      const newStock = prod.quantity + delta;
      if (newStock < 0) {
        throw new Error(
          `Insufficient stock for ${prod.name}. Current stock is ${prod.quantity}, cannot deduct ${qty}.`,
        );
      }

      const updatedProduct: Product = {
        ...prod,
        quantity: newStock,
        updatedAt: now,
      };
      store.products[idx] = updatedProduct;

      const movement: StockMovement = {
        id: `mov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        type: input.type,
        quantityDelta: delta,
        previousStock: prod.quantity,
        newStock,
        referenceNumber: `ADJ-${Date.now().toString().slice(-5)}`,
        reason: input.reason.trim(),
        ownerId: "workspace_owner",
        createdAt: now,
      };
      store.movements.unshift(movement);
      saveDiskStore();
      return { product: updatedProduct, movement };
    });
  },

  // SUPPLIERS
  async listSuppliers(): Promise<Supplier[]> {
    if (isAtlasConnected) {
      const docs = await SupplierModel.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => stripMongoDoc<Supplier>(d));
    }
    const store = loadDiskStore();
    return [...store.suppliers];
  },

  async createSupplier(
    input: Omit<Supplier, "id" | "ownerId" | "createdAt" | "updatedAt">,
  ): Promise<Supplier> {
    return withWriteLock(async () => {
      if (!input.name?.trim())
        throw new Error("Supplier company name is required.");
      const now = new Date().toISOString();
      const supplier: Supplier = {
        ...input,
        id: `sup_${Date.now().toString(36)}`,
        name: input.name.trim(),
        code: (input.code || `SUP-${Date.now().toString().slice(-4)}`)
          .trim()
          .toUpperCase(),
        ownerId: "workspace_owner",
        createdAt: now,
        updatedAt: now,
      };

      if (isAtlasConnected) {
        await SupplierModel.create(supplier);
        return supplier;
      }
      const store = loadDiskStore();
      store.suppliers.unshift(supplier);
      saveDiskStore();
      return supplier;
    });
  },

  async updateSupplier(
    id: string,
    updates: Partial<Supplier>,
  ): Promise<Supplier> {
    return withWriteLock(async () => {
      const now = new Date().toISOString();
      if (isAtlasConnected) {
        const doc = await SupplierModel.findOneAndUpdate(
          { id },
          { $set: { ...updates, updatedAt: now } },
          { new: true },
        ).lean();
        if (!doc) throw new Error("Supplier not found.");
        return stripMongoDoc<Supplier>(doc);
      }
      const store = loadDiskStore();
      const idx = store.suppliers.findIndex((s) => s.id === id);
      if (idx === -1) throw new Error("Supplier not found.");
      store.suppliers[idx] = {
        ...store.suppliers[idx],
        ...updates,
        updatedAt: now,
      };
      saveDiskStore();
      return store.suppliers[idx];
    });
  },

  async deleteSupplier(id: string): Promise<void> {
    return withWriteLock(async () => {
      if (isAtlasConnected) {
        const hasPurchases = await PurchaseModel.findOne({
          supplierId: id,
        }).lean();
        if (hasPurchases) {
          const err: any = new Error(
            "Cannot delete this supplier because they have linked purchase orders.",
          );
          err.statusCode = 409;
          throw err;
        }
        await SupplierModel.deleteOne({ id });
        return;
      }
      const store = loadDiskStore();
      if (store.purchases.some((po) => po.supplierId === id)) {
        const err: any = new Error(
          "Cannot delete this supplier because they have linked purchase orders.",
        );
        err.statusCode = 409;
        throw err;
      }
      store.suppliers = store.suppliers.filter((s) => s.id !== id);
      saveDiskStore();
    });
  },

  // CUSTOMERS
  async listCustomers(): Promise<Customer[]> {
    if (isAtlasConnected) {
      const docs = await CustomerModel.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => stripMongoDoc<Customer>(d));
    }
    const store = loadDiskStore();
    return [...store.customers];
  },

  async createCustomer(
    input: Omit<Customer, "id" | "ownerId" | "createdAt" | "updatedAt">,
  ): Promise<Customer> {
    return withWriteLock(async () => {
      if (!input.name?.trim() && !input.company?.trim()) {
        throw new Error("Customer name or company is required.");
      }
      const now = new Date().toISOString();
      const customer: Customer = {
        ...input,
        id: `cust_${Date.now().toString(36)}`,
        name: (input.name || input.company).trim(),
        company: (input.company || input.name).trim(),
        creditLimit: Number(input.creditLimit || 0),
        outstandingBalance: Number(input.outstandingBalance || 0),
        ownerId: "workspace_owner",
        createdAt: now,
        updatedAt: now,
      };

      if (isAtlasConnected) {
        await CustomerModel.create(customer);
        return customer;
      }
      const store = loadDiskStore();
      store.customers.unshift(customer);
      saveDiskStore();
      return customer;
    });
  },

  async updateCustomer(
    id: string,
    updates: Partial<Customer>,
  ): Promise<Customer> {
    return withWriteLock(async () => {
      const now = new Date().toISOString();
      if (isAtlasConnected) {
        const doc = await CustomerModel.findOneAndUpdate(
          { id },
          { $set: { ...updates, updatedAt: now } },
          { new: true },
        ).lean();
        if (!doc) throw new Error("Customer not found.");
        return stripMongoDoc<Customer>(doc);
      }
      const store = loadDiskStore();
      const idx = store.customers.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error("Customer not found.");
      store.customers[idx] = {
        ...store.customers[idx],
        ...updates,
        updatedAt: now,
      };
      saveDiskStore();
      return store.customers[idx];
    });
  },

  async deleteCustomer(id: string): Promise<void> {
    return withWriteLock(async () => {
      if (isAtlasConnected) {
        const hasSales = await SaleModel.findOne({ customerId: id }).lean();
        if (hasSales) {
          const err: any = new Error(
            "Cannot delete this customer because they have linked sales invoices.",
          );
          err.statusCode = 409;
          throw err;
        }
        await CustomerModel.deleteOne({ id });
        return;
      }
      const store = loadDiskStore();
      if (store.sales.some((s) => s.customerId === id)) {
        const err: any = new Error(
          "Cannot delete this customer because they have linked sales invoices.",
        );
        err.statusCode = 409;
        throw err;
      }
      store.customers = store.customers.filter((c) => c.id !== id);
      saveDiskStore();
    });
  },

  // PURCHASES (Multi-item atomic stock increase + StockMovement + Payment)
  async listPurchases(): Promise<PurchaseOrder[]> {
    if (isAtlasConnected) {
      const docs = await PurchaseModel.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => stripMongoDoc<PurchaseOrder>(d));
    }
    const store = loadDiskStore();
    return [...store.purchases];
  },

  async createPurchase(input: {
    supplierId: string;
    productId?: string;
    quantity?: number;
    unitPrice?: number;
    items?: Array<{ productId: string; quantity: number; unitPrice: number }>;
    taxRate?: number;
    paymentStatus: "Paid" | "Pending" | "Partial";
    amountPaid?: number;
    notes: string;
    recordedBy?: string;
  }): Promise<PurchaseOrder> {
    return withWriteLock(async () => {
      const rawItems =
        input.items && input.items.length > 0
          ? input.items
          : input.productId
            ? [
                {
                  productId: input.productId,
                  quantity: Number(input.quantity || 0),
                  unitPrice: Number(input.unitPrice || 0),
                },
              ]
            : [];

      if (rawItems.length === 0) {
        throw new Error(
          "At least one product line item is required for a purchase order.",
        );
      }

      const now = new Date().toISOString();
      const settings = await this.getSettings();
      const taxRate =
        input.taxRate !== undefined
          ? Number(input.taxRate)
          : settings.defaultTaxRate;

      if (isAtlasConnected) {
        const supplier = await SupplierModel.findOne({
          id: input.supplierId,
        }).lean();
        if (!supplier) throw new Error("Selected supplier not found.");

        const resolvedItems: PurchaseItem[] = [];
        for (const item of rawItems) {
          const qty = Math.round(Number(item.quantity));
          const price = Number(item.unitPrice);
          if (!Number.isFinite(qty) || qty <= 0) {
            throw new Error(
              "Purchase item quantity must be greater than zero.",
            );
          }
          if (!Number.isFinite(price) || price < 0) {
            throw new Error("Purchase unit cost cannot be negative.");
          }
          const prod = await ProductModel.findOne({
            id: item.productId,
          }).lean();
          if (!prod) throw new Error(`Product ${item.productId} not found.`);
          resolvedItems.push({
            productId: (prod as any).id,
            productName: (prod as any).name,
            sku: (prod as any).sku,
            unit: (prod as any).unit,
            quantity: qty,
            unitPrice: price,
            lineTotal: Math.round(qty * price * 100) / 100,
          });
        }

        const totals = calculatePurchaseTotals(resolvedItems, taxRate);
        const poCount = await PurchaseModel.countDocuments();
        const poNumber = `PO-2026-${String(84 + poCount + 1).padStart(3, "0")}`;
        const first = resolvedItems[0];
        const totalQty = resolvedItems.reduce((s, i) => s + i.quantity, 0);

        const amountPaid =
          input.paymentStatus === "Paid"
            ? totals.totalAmount
            : input.paymentStatus === "Partial"
              ? Math.min(
                  totals.totalAmount,
                  Math.max(0, Number(input.amountPaid || 0)),
                )
              : 0;
        const balanceDue =
          Math.round(Math.max(0, totals.totalAmount - amountPaid) * 100) / 100;

        const poRecord: PurchaseOrder = {
          id: `po_${Date.now().toString(36)}`,
          poNumber,
          supplierId: (supplier as any).id,
          supplierName: (supplier as any).name,
          productId: first.productId,
          productName:
            resolvedItems.length > 1
              ? `${first.productName} (+${resolvedItems.length - 1} more)`
              : first.productName,
          sku: first.sku,
          quantity: totalQty,
          unitPrice: first.unitPrice,
          subtotal: totals.subtotal,
          taxRate: totals.taxRate,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          amountPaid,
          balanceDue,
          paymentStatus: input.paymentStatus,
          itemsSummary: JSON.stringify(resolvedItems),
          notes: input.notes || "",
          status: "completed",
          ownerId: "workspace_owner",
          createdAt: now,
          updatedAt: now,
        };

        for (const line of resolvedItems) {
          const prod = await ProductModel.findOne({
            id: line.productId,
          }).lean();
          const prevStock = Number((prod as any).quantity);
          const newStock = prevStock + line.quantity;
          await ProductModel.updateOne(
            { id: line.productId },
            {
              $set: {
                quantity: newStock,
                purchasePrice: line.unitPrice,
                updatedAt: now,
              },
            },
          );
          await StockMovementModel.create({
            id: `mov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            productId: line.productId,
            productName: line.productName,
            sku: line.sku,
            type: "IN_PURCHASE",
            quantityDelta: line.quantity,
            previousStock: prevStock,
            newStock,
            referenceNumber: poNumber,
            reason: `Inward stock receipt from ${(supplier as any).name}`,
            ownerId: "workspace_owner",
            createdAt: now,
          });
        }

        await PurchaseModel.create({ ...poRecord, items: resolvedItems });

        if (amountPaid > 0) {
          await PaymentModel.create({
            id: `pay_${Date.now().toString(36)}`,
            paymentNumber: `PAY-${Date.now().toString().slice(-6)}`,
            purchaseId: poRecord.id,
            poNumber: poRecord.poNumber,
            supplierId: poRecord.supplierId,
            partyName: poRecord.supplierName,
            type: "OUTGOING_PURCHASE",
            amount: amountPaid,
            method: "Bank Transfer",
            reference: poRecord.poNumber,
            notes: `Supplier settlement for ${poRecord.poNumber}`,
            recordedBy: input.recordedBy || "Admin",
            createdAt: now,
          });
        }

        return poRecord;
      }

      // Disk store path
      const store = loadDiskStore();
      const supplier = store.suppliers.find((s) => s.id === input.supplierId);
      if (!supplier) throw new Error("Selected supplier not found.");

      const resolvedItems: PurchaseItem[] = [];
      for (const item of rawItems) {
        const qty = Math.round(Number(item.quantity));
        const price = Number(item.unitPrice);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error("Purchase item quantity must be greater than zero.");
        }
        if (!Number.isFinite(price) || price < 0) {
          throw new Error("Purchase unit cost cannot be negative.");
        }
        const prod = store.products.find((p) => p.id === item.productId);
        if (!prod) throw new Error(`Product ${item.productId} not found.`);
        resolvedItems.push({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          unit: prod.unit,
          quantity: qty,
          unitPrice: price,
          lineTotal: Math.round(qty * price * 100) / 100,
        });
      }

      const totals = calculatePurchaseTotals(resolvedItems, taxRate);
      const poNumber = `PO-2026-${String(84 + store.purchases.length + 1).padStart(3, "0")}`;
      const first = resolvedItems[0];
      const totalQty = resolvedItems.reduce((s, i) => s + i.quantity, 0);

      const amountPaid =
        input.paymentStatus === "Paid"
          ? totals.totalAmount
          : input.paymentStatus === "Partial"
            ? Math.min(
                totals.totalAmount,
                Math.max(0, Number(input.amountPaid || 0)),
              )
            : 0;
      const balanceDue =
        Math.round(Math.max(0, totals.totalAmount - amountPaid) * 100) / 100;

      const poRecord: PurchaseOrder = {
        id: `po_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        poNumber,
        supplierId: supplier.id,
        supplierName: supplier.name,
        productId: first.productId,
        productName:
          resolvedItems.length > 1
            ? `${first.productName} (+${resolvedItems.length - 1} more)`
            : first.productName,
        sku: first.sku,
        quantity: totalQty,
        unitPrice: first.unitPrice,
        subtotal: totals.subtotal,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        amountPaid,
        balanceDue,
        paymentStatus: input.paymentStatus,
        itemsSummary: JSON.stringify(resolvedItems),
        notes: input.notes || "",
        status: "completed",
        ownerId: "workspace_owner",
        createdAt: now,
        updatedAt: now,
      };

      for (const line of resolvedItems) {
        const pIdx = store.products.findIndex((p) => p.id === line.productId);
        const prod = store.products[pIdx];
        const prevStock = prod.quantity;
        const newStock = prevStock + line.quantity;
        store.products[pIdx] = {
          ...prod,
          quantity: newStock,
          purchasePrice: line.unitPrice,
          updatedAt: now,
        };
        store.movements.unshift({
          id: `mov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          productId: line.productId,
          productName: line.productName,
          sku: line.sku,
          type: "IN_PURCHASE",
          quantityDelta: line.quantity,
          previousStock: prevStock,
          newStock,
          referenceNumber: poNumber,
          reason: `Inward stock receipt from ${supplier.name}`,
          ownerId: "workspace_owner",
          createdAt: now,
        });
      }

      store.purchases.unshift(poRecord);

      if (amountPaid > 0) {
        store.payments.unshift({
          id: `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          paymentNumber: `PAY-${Date.now().toString().slice(-6)}`,
          purchaseId: poRecord.id,
          poNumber: poRecord.poNumber,
          supplierId: poRecord.supplierId,
          partyName: poRecord.supplierName,
          type: "OUTGOING_PURCHASE",
          amount: amountPaid,
          method: "Bank Transfer",
          reference: poRecord.poNumber,
          notes: `Supplier settlement for ${poRecord.poNumber}`,
          recordedBy: input.recordedBy || "Admin",
          createdAt: now,
        });
      }

      saveDiskStore();
      return poRecord;
    });
  },

  // SALES & INVOICES (Server-side validation, atomic stock deduction, idempotency protection)
  async listSales(): Promise<SaleInvoice[]> {
    if (isAtlasConnected) {
      const docs = await SaleModel.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => stripMongoDoc<SaleInvoice>(d));
    }
    const store = loadDiskStore();
    return [...store.sales];
  },

  async getSaleById(id: string): Promise<SaleInvoice | null> {
    if (isAtlasConnected) {
      const doc = await SaleModel.findOne({
        $or: [{ id }, { invoiceNumber: id }],
      }).lean();
      return doc ? stripMongoDoc<SaleInvoice>(doc) : null;
    }
    const store = loadDiskStore();
    return (
      store.sales.find((s) => s.id === id || s.invoiceNumber === id) || null
    );
  },

  async createSale(input: {
    customerId: string;
    items: Array<{ productId: string; quantity: number }>;
    discountAmount?: number;
    taxRate?: number;
    paymentMethod: "Bank Transfer" | "Card" | "Cash" | "Credit Account" | "UPI";
    paymentStatus: "Paid" | "Pending" | "Partial";
    amountPaid?: number;
    notes?: string;
    idempotencyKey?: string;
    recordedBy?: string;
  }): Promise<SaleInvoice> {
    return withWriteLock(async () => {
      if (!input.items || input.items.length === 0) {
        throw new Error("Cannot issue an invoice with an empty cart.");
      }

      // Merge any duplicate product lines in the request so stock validation is exact
      const mergedItemsMap = new Map<string, number>();
      for (const raw of input.items) {
        const qty = Math.round(Number(raw.quantity));
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error("Line item quantity must be a positive integer.");
        }
        mergedItemsMap.set(
          raw.productId,
          (mergedItemsMap.get(raw.productId) || 0) + qty,
        );
      }

      const now = new Date().toISOString();
      const settings = await this.getSettings();
      const effectiveTaxRate =
        input.taxRate !== undefined && Number.isFinite(Number(input.taxRate))
          ? Math.max(0, Number(input.taxRate))
          : settings.defaultTaxRate;

      if (isAtlasConnected) {
        if (input.idempotencyKey) {
          const existing = await SaleModel.findOne({
            idempotencyKey: input.idempotencyKey,
          }).lean();
          if (existing) return stripMongoDoc<SaleInvoice>(existing);
        }

        let customer: Customer;
        if (input.customerId === "walk_in") {
          customer = {
            id: "walk_in",
            name: "Walk-In Trade Customer",
            company: "Cash Counter / Direct Trade",
            phone: "",
            email: "",
            city: "",
            gstOrTaxId: "UNREGISTERED",
            creditLimit: 0,
            outstandingBalance: 0,
            tier: "Walk-In Trade",
            ownerId: "workspace_owner",
            createdAt: now,
            updatedAt: now,
          };
        } else {
          const custDoc = await CustomerModel.findOne({
            id: input.customerId,
          }).lean();
          if (!custDoc)
            throw new Error("Selected customer account was not found.");
          customer = stripMongoDoc<Customer>(custDoc);
        }

        // Validate all products & stock from database (ignoring any client-supplied prices)
        const lineItems: SaleLineItem[] = [];
        for (const [productId, qty] of mergedItemsMap.entries()) {
          const prodDoc = await ProductModel.findOne({ id: productId }).lean();
          if (!prodDoc) throw new Error(`Product ${productId} does not exist.`);
          const prod = stripMongoDoc<Product>(prodDoc);
          if (prod.quantity < qty) {
            throw new Error(
              `Insufficient stock for "${prod.name}". Available: ${prod.quantity} ${prod.unit}, requested: ${qty}.`,
            );
          }
          lineItems.push({
            productId: prod.id,
            productName: prod.name,
            sku: prod.sku,
            category: prod.category,
            unit: prod.unit,
            quantity: qty,
            unitPrice: prod.sellingPrice,
            lineTotal: Math.round(qty * prod.sellingPrice * 100) / 100,
          });
        }

        const totals = calculateInvoiceTotals(
          lineItems,
          Number(input.discountAmount || 0),
          effectiveTaxRate,
        );

        const saleCount = await SaleModel.countDocuments();
        const invoiceNumber = `${settings.invoicePrefix}${1041 + saleCount + 1}`;

        const amountPaid =
          input.paymentStatus === "Paid"
            ? totals.grandTotal
            : input.paymentStatus === "Partial"
              ? Math.min(
                  totals.grandTotal,
                  Math.max(0, Number(input.amountPaid || 0)),
                )
              : 0;
        const balanceDue =
          Math.round(Math.max(0, totals.grandTotal - amountPaid) * 100) / 100;

        // Atomic conditional stock decrement per item with rollback safety
        const deducted: Array<{
          productId: string;
          qty: number;
          prevStock: number;
          item: SaleLineItem;
        }> = [];
        for (const item of lineItems) {
          const updatedProd = await ProductModel.findOneAndUpdate(
            { id: item.productId, quantity: { $gte: item.quantity } },
            { $inc: { quantity: -item.quantity }, $set: { updatedAt: now } },
            { new: true },
          ).lean();

          if (!updatedProd) {
            // Rollback any prior decrements
            for (const d of deducted) {
              await ProductModel.updateOne(
                { id: d.productId },
                { $inc: { quantity: d.qty } },
              );
            }
            throw new Error(
              `Concurrent stock conflict on "${item.productName}". Please retry.`,
            );
          }
          const newStock = Number((updatedProd as any).quantity);
          deducted.push({
            productId: item.productId,
            qty: item.quantity,
            prevStock: newStock + item.quantity,
            item,
          });
        }

        for (const d of deducted) {
          await StockMovementModel.create({
            id: `mov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            productId: d.item.productId,
            productName: d.item.productName,
            sku: d.item.sku,
            type: "OUT_SALE",
            quantityDelta: -d.qty,
            previousStock: d.prevStock,
            newStock: d.prevStock - d.qty,
            referenceNumber: invoiceNumber,
            reason: `Dispatched on Invoice ${invoiceNumber} to ${customer.company}`,
            ownerId: "workspace_owner",
            createdAt: now,
          });
        }

        const saleInvoice: SaleInvoice = {
          id: `sale_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          invoiceNumber,
          customerId: customer.id,
          customerName: customer.name,
          customerCompany: customer.company,
          primaryProductId: lineItems[0].productId,
          primaryProductName: lineItems[0].productName,
          itemCount: lineItems.length,
          totalQuantity: totals.totalQuantity,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxRate: totals.taxRate,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,
          amountPaid,
          balanceDue,
          paymentMethod: input.paymentMethod,
          paymentStatus:
            balanceDue === 0 ? "Paid" : amountPaid > 0 ? "Partial" : "Pending",
          notes:
            input.notes || "Standard yard dispatch & trade counter release.",
          itemsSummary: JSON.stringify(lineItems),
          status: balanceDue === 0 ? "completed" : "issued",
          ownerId: "workspace_owner",
          createdAt: now,
          updatedAt: now,
        };

        await SaleModel.create({
          ...saleInvoice,
          items: lineItems,
          idempotencyKey: input.idempotencyKey,
        });

        await InvoiceModel.create({
          id: `inv_${saleInvoice.id}`,
          saleId: saleInvoice.id,
          invoiceNumber: saleInvoice.invoiceNumber,
          customerId: saleInvoice.customerId,
          customerName: saleInvoice.customerName,
          customerCompany: saleInvoice.customerCompany,
          subtotal: saleInvoice.subtotal,
          discountAmount: saleInvoice.discountAmount,
          taxRate: saleInvoice.taxRate,
          taxAmount: saleInvoice.taxAmount,
          grandTotal: saleInvoice.grandTotal,
          amountPaid: saleInvoice.amountPaid,
          balanceDue: saleInvoice.balanceDue,
          paymentMethod: saleInvoice.paymentMethod,
          paymentStatus: saleInvoice.paymentStatus,
          items: lineItems,
          itemsSummary: saleInvoice.itemsSummary,
          notes: saleInvoice.notes,
          issuedAt: now,
        });

        if (amountPaid > 0) {
          await PaymentModel.create({
            id: `pay_${Date.now().toString(36)}`,
            paymentNumber: `PAY-${Date.now().toString().slice(-6)}`,
            invoiceId: saleInvoice.id,
            invoiceNumber: saleInvoice.invoiceNumber,
            customerId: saleInvoice.customerId,
            partyName: saleInvoice.customerCompany,
            type: "INCOMING_SALE",
            amount: amountPaid,
            method: input.paymentMethod,
            reference: saleInvoice.invoiceNumber,
            notes: `Payment received on Invoice ${saleInvoice.invoiceNumber}`,
            recordedBy: input.recordedBy || "Billing Desk",
            createdAt: now,
          });
        }

        if (balanceDue > 0 && customer.id !== "walk_in") {
          await CustomerModel.updateOne(
            { id: customer.id },
            {
              $inc: { outstandingBalance: balanceDue },
              $set: { updatedAt: now },
            },
          );
        }

        return saleInvoice;
      }

      // Disk store path (inside withWriteLock mutex)
      const store = loadDiskStore();
      if (input.idempotencyKey) {
        const existing = (store.sales as any[]).find(
          (s) => s.idempotencyKey === input.idempotencyKey,
        );
        if (existing) return existing;
      }

      let customer: Customer;
      let custIdx = -1;
      if (input.customerId === "walk_in") {
        customer = {
          id: "walk_in",
          name: "Walk-In Trade Customer",
          company: "Cash Counter / Direct Trade",
          phone: "",
          email: "",
          city: "",
          gstOrTaxId: "UNREGISTERED",
          creditLimit: 0,
          outstandingBalance: 0,
          tier: "Walk-In Trade",
          ownerId: "workspace_owner",
          createdAt: now,
          updatedAt: now,
        };
      } else {
        custIdx = store.customers.findIndex((c) => c.id === input.customerId);
        if (custIdx === -1)
          throw new Error("Selected customer account was not found.");
        customer = store.customers[custIdx];
      }

      const lineItems: SaleLineItem[] = [];
      for (const [productId, qty] of mergedItemsMap.entries()) {
        const prod = store.products.find((p) => p.id === productId);
        if (!prod) throw new Error(`Product ${productId} does not exist.`);
        if (prod.quantity < qty) {
          throw new Error(
            `Insufficient stock for "${prod.name}". Available: ${prod.quantity} ${prod.unit}, requested: ${qty}.`,
          );
        }
        lineItems.push({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          category: prod.category,
          unit: prod.unit,
          quantity: qty,
          unitPrice: prod.sellingPrice,
          lineTotal: Math.round(qty * prod.sellingPrice * 100) / 100,
        });
      }

      const totals = calculateInvoiceTotals(
        lineItems,
        Number(input.discountAmount || 0),
        effectiveTaxRate,
      );

      const invoiceNumber = `${settings.invoicePrefix}${1041 + store.sales.length + 1}`;
      const amountPaid =
        input.paymentStatus === "Paid"
          ? totals.grandTotal
          : input.paymentStatus === "Partial"
            ? Math.min(
                totals.grandTotal,
                Math.max(0, Number(input.amountPaid || 0)),
              )
            : 0;
      const balanceDue =
        Math.round(Math.max(0, totals.grandTotal - amountPaid) * 100) / 100;

      // Deduct stock & log movements
      for (const item of lineItems) {
        const pIdx = store.products.findIndex((p) => p.id === item.productId);
        const prod = store.products[pIdx];
        const prevStock = prod.quantity;
        const newStock = prevStock - item.quantity;
        store.products[pIdx] = {
          ...prod,
          quantity: newStock,
          updatedAt: now,
        };
        store.movements.unshift({
          id: `mov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          type: "OUT_SALE",
          quantityDelta: -item.quantity,
          previousStock: prevStock,
          newStock,
          referenceNumber: invoiceNumber,
          reason: `Dispatched on Invoice ${invoiceNumber} to ${customer.company}`,
          ownerId: "workspace_owner",
          createdAt: now,
        });
      }

      const saleInvoice: SaleInvoice & { idempotencyKey?: string } = {
        id: `sale_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        invoiceNumber,
        customerId: customer.id,
        customerName: customer.name,
        customerCompany: customer.company,
        primaryProductId: lineItems[0].productId,
        primaryProductName: lineItems[0].productName,
        itemCount: lineItems.length,
        totalQuantity: totals.totalQuantity,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        grandTotal: totals.grandTotal,
        amountPaid,
        balanceDue,
        paymentMethod: input.paymentMethod,
        paymentStatus:
          balanceDue === 0 ? "Paid" : amountPaid > 0 ? "Partial" : "Pending",
        notes: input.notes || "Standard yard dispatch & trade counter release.",
        itemsSummary: JSON.stringify(lineItems),
        status: balanceDue === 0 ? "completed" : "issued",
        ownerId: "workspace_owner",
        createdAt: now,
        updatedAt: now,
        idempotencyKey: input.idempotencyKey,
      };

      store.sales.unshift(saleInvoice);

      if (amountPaid > 0) {
        store.payments.unshift({
          id: `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          paymentNumber: `PAY-${Date.now().toString().slice(-6)}`,
          invoiceId: saleInvoice.id,
          invoiceNumber: saleInvoice.invoiceNumber,
          customerId: saleInvoice.customerId,
          partyName: saleInvoice.customerCompany,
          type: "INCOMING_SALE",
          amount: amountPaid,
          method: input.paymentMethod,
          reference: saleInvoice.invoiceNumber,
          notes: `Payment received on Invoice ${saleInvoice.invoiceNumber}`,
          recordedBy: input.recordedBy || "Billing Desk",
          createdAt: now,
        });
      }

      if (balanceDue > 0 && custIdx !== -1) {
        store.customers[custIdx] = {
          ...store.customers[custIdx],
          outstandingBalance:
            Math.round(
              (store.customers[custIdx].outstandingBalance + balanceDue) * 100,
            ) / 100,
          updatedAt: now,
        };
      }

      saveDiskStore();
      return saleInvoice;
    });
  },

  // PAYMENTS (Record full or partial settlement against an Invoice or Purchase Order)
  async listPayments(): Promise<PaymentRecord[]> {
    if (isAtlasConnected) {
      const docs = await PaymentModel.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => stripMongoDoc<PaymentRecord>(d));
    }
    const store = loadDiskStore();
    return [...store.payments];
  },

  async recordPayment(input: {
    invoiceId?: string;
    purchaseId?: string;
    amount: number;
    method: "Bank Transfer" | "Card" | "Cash" | "Credit Account" | "UPI";
    reference?: string;
    notes?: string;
    recordedBy?: string;
  }): Promise<{
    payment: PaymentRecord;
    updatedInvoice?: SaleInvoice;
    updatedPurchase?: PurchaseOrder;
  }> {
    return withWriteLock(async () => {
      const amount = Math.round(Number(input.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Payment amount must be greater than zero.");
      }
      const now = new Date().toISOString();

      if (isAtlasConnected) {
        if (input.invoiceId) {
          const saleDoc = await SaleModel.findOne({
            id: input.invoiceId,
          }).lean();
          if (!saleDoc) throw new Error("Invoice not found.");
          const sale = stripMongoDoc<SaleInvoice>(saleDoc);
          const currentPaid =
            sale.amountPaid !== undefined
              ? sale.amountPaid
              : sale.paymentStatus === "Paid"
                ? sale.grandTotal
                : 0;
          const currentBalance =
            sale.balanceDue !== undefined
              ? sale.balanceDue
              : Math.max(0, sale.grandTotal - currentPaid);

          if (currentBalance <= 0) {
            throw new Error("This invoice is already fully paid.");
          }
          const applied = Math.min(currentBalance, amount);
          const newPaid = Math.round((currentPaid + applied) * 100) / 100;
          const newBalance =
            Math.round(Math.max(0, sale.grandTotal - newPaid) * 100) / 100;
          const newStatus: "Paid" | "Partial" =
            newBalance === 0 ? "Paid" : "Partial";

          const updatedDoc = await SaleModel.findOneAndUpdate(
            { id: sale.id },
            {
              $set: {
                amountPaid: newPaid,
                balanceDue: newBalance,
                paymentStatus: newStatus,
                status: newBalance === 0 ? "completed" : "issued",
                updatedAt: now,
              },
            },
            { new: true },
          ).lean();

          await InvoiceModel.updateOne(
            { saleId: sale.id },
            {
              $set: {
                amountPaid: newPaid,
                balanceDue: newBalance,
                paymentStatus: newStatus,
                updatedAt: now,
              },
            },
          );

          if (sale.customerId && sale.customerId !== "walk_in") {
            const cust = await CustomerModel.findOne({
              id: sale.customerId,
            }).lean();
            if (cust) {
              const nextOut = Math.max(
                0,
                Number((cust as any).outstandingBalance || 0) - applied,
              );
              await CustomerModel.updateOne(
                { id: sale.customerId },
                {
                  $set: {
                    outstandingBalance: Math.round(nextOut * 100) / 100,
                    updatedAt: now,
                  },
                },
              );
            }
          }

          const payment: PaymentRecord = {
            id: `pay_${Date.now().toString(36)}`,
            paymentNumber: `PAY-${Date.now().toString().slice(-6)}`,
            invoiceId: sale.id,
            invoiceNumber: sale.invoiceNumber,
            customerId: sale.customerId,
            partyName: sale.customerCompany,
            type: "INCOMING_SALE",
            amount: applied,
            method: input.method,
            reference: input.reference || sale.invoiceNumber,
            notes: input.notes || `Settlement against ${sale.invoiceNumber}`,
            recordedBy: input.recordedBy || "Billing Desk",
            createdAt: now,
          };
          await PaymentModel.create(payment);
          return {
            payment,
            updatedInvoice: stripMongoDoc<SaleInvoice>(updatedDoc),
          };
        }

        throw new Error("An invoiceId is required to record a payment.");
      }

      // Disk store path
      const store = loadDiskStore();
      if (input.invoiceId) {
        const sIdx = store.sales.findIndex((s) => s.id === input.invoiceId);
        if (sIdx === -1) throw new Error("Invoice not found.");
        const sale = store.sales[sIdx];
        const currentPaid =
          sale.amountPaid !== undefined
            ? sale.amountPaid
            : sale.paymentStatus === "Paid"
              ? sale.grandTotal
              : 0;
        const currentBalance =
          sale.balanceDue !== undefined
            ? sale.balanceDue
            : Math.max(0, sale.grandTotal - currentPaid);

        if (currentBalance <= 0) {
          throw new Error("This invoice is already fully paid.");
        }

        const applied = Math.min(currentBalance, amount);
        const newPaid = Math.round((currentPaid + applied) * 100) / 100;
        const newBalance =
          Math.round(Math.max(0, sale.grandTotal - newPaid) * 100) / 100;
        const newStatus: "Paid" | "Partial" =
          newBalance === 0 ? "Paid" : "Partial";

        const updatedInvoice: SaleInvoice = {
          ...sale,
          amountPaid: newPaid,
          balanceDue: newBalance,
          paymentStatus: newStatus,
          status: newBalance === 0 ? "completed" : "issued",
          updatedAt: now,
        };
        store.sales[sIdx] = updatedInvoice;

        if (sale.customerId && sale.customerId !== "walk_in") {
          const cIdx = store.customers.findIndex(
            (c) => c.id === sale.customerId,
          );
          if (cIdx !== -1) {
            const nextOut = Math.max(
              0,
              store.customers[cIdx].outstandingBalance - applied,
            );
            store.customers[cIdx] = {
              ...store.customers[cIdx],
              outstandingBalance: Math.round(nextOut * 100) / 100,
              updatedAt: now,
            };
          }
        }

        const payment: PaymentRecord = {
          id: `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          paymentNumber: `PAY-${Date.now().toString().slice(-6)}`,
          invoiceId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          customerId: sale.customerId,
          partyName: sale.customerCompany,
          type: "INCOMING_SALE",
          amount: applied,
          method: input.method,
          reference: input.reference || sale.invoiceNumber,
          notes: input.notes || `Settlement against ${sale.invoiceNumber}`,
          recordedBy: input.recordedBy || "Billing Desk",
          createdAt: now,
        };
        store.payments.unshift(payment);
        saveDiskStore();
        return { payment, updatedInvoice };
      }

      throw new Error("An invoiceId is required to record a payment.");
    });
  },

  // BUSINESS SETTINGS
  async getSettings(): Promise<BusinessSettings> {
    if (isAtlasConnected) {
      const doc = await BusinessSettingsModel.findOne({
        id: "default_settings",
      }).lean();
      return doc
        ? stripMongoDoc<BusinessSettings>(doc)
        : { ...DEFAULT_BUSINESS_SETTINGS };
    }
    const store = loadDiskStore();
    return { ...store.settings };
  },

  async updateSettings(
    updates: Partial<BusinessSettings>,
  ): Promise<BusinessSettings> {
    return withWriteLock(async () => {
      const now = new Date().toISOString();
      if (isAtlasConnected) {
        const doc = await BusinessSettingsModel.findOneAndUpdate(
          { id: "default_settings" },
          { $set: { ...updates, updatedAt: now } },
          { new: true, upsert: true },
        ).lean();
        return stripMongoDoc<BusinessSettings>(doc);
      }
      const store = loadDiskStore();
      store.settings = {
        ...store.settings,
        ...updates,
        updatedAt: now,
      };
      saveDiskStore();
      return { ...store.settings };
    });
  },

  // CLEAR WORKSPACE RECORDS (NO DUMMY SEEDING)
  async resetDemoData(): Promise<void> {
    return withWriteLock(async () => {
      if (isAtlasConnected) {
        await ProductModel.deleteMany({});
        await SupplierModel.deleteMany({});
        await CustomerModel.deleteMany({});
        await PurchaseModel.deleteMany({});
        await SaleModel.deleteMany({});
        await InvoiceModel.deleteMany({});
        await PaymentModel.deleteMany({});
        await StockMovementModel.deleteMany({});
        await ensureAtlasInitialized();
        return;
      }
      const initialUsers = buildInitialUsers();
      const currentUsers = diskStore?.users?.length
        ? [...diskStore.users]
        : [...initialUsers];
      for (const initUser of initialUsers) {
        if (
          !currentUsers.some(
            (u) => u.email.toLowerCase() === initUser.email.toLowerCase(),
          )
        ) {
          currentUsers.unshift(initUser);
        }
      }
      diskStore = {
        users: currentUsers,
        products: [],
        suppliers: [],
        customers: [],
        purchases: [],
        sales: [],
        payments: [],
        movements: [],
        settings: diskStore?.settings || { ...DEFAULT_BUSINESS_SETTINGS },
      };
      saveDiskStore();
    });
  },
};
