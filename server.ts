import 'dotenv/config';
import path from 'path';
import express, { type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import { dbRepo, getAdminCredentials, getDatabaseStatus, getJwtSecret, initDatabase } from './src/server/db.ts';
import { computeDashboardMetrics, evaluateLowStockAlerts, filterRecordsByPeriod } from './src/utils/inventoryLogic.ts';
import {
  buildPrintableInvoiceHtml,
  buildPrintablePurchaseOrderHtml,
  numberToIndianWords,
  type InvoiceCopyType,
  type PrintPaperFormat,
} from './src/utils/printUtils.ts';
import type { DatePeriodFilter, UserRole } from './src/types.ts';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    name: string;
    role: UserRole;
  };
}

function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      uid: string;
      email: string;
      name: string;
      role: UserRole;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
  }
}

function requireRoles(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Role "${req.user.role}" does not have permission for this action.`,
      });
      return;
    }
    next();
  };
}

export async function createApp() {
  await initDatabase();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 1. Health & Public Catalog
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      dbStatus: getDatabaseStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/public/catalog', async (_req, res) => {
    try {
      const [products, suppliers, sales, purchases, settings] = await Promise.all([
        dbRepo.listProducts(),
        dbRepo.listSuppliers(),
        dbRepo.listSales(),
        dbRepo.listPurchases(),
        dbRepo.getSettings(),
      ]);
      res.json({
        products,
        suppliers,
        sales,
        purchases,
        settings,
        dbStatus: getDatabaseStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load public catalog.' });
    }
  });

  // 2. Authentication Routes
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password, phone, role, department, businessName } = req.body || {};
      if (!name || !email || !password) {
        res.status(400).json({ error: 'Name, email, and password are required.' });
        return;
      }

      const user = await dbRepo.registerUser({
        name: String(name),
        email: String(email),
        password: String(password),
        phone: phone ? String(phone) : undefined,
        role: (role as UserRole) || 'Admin',
        department: department ? String(department) : undefined,
        businessName: businessName ? String(businessName) : undefined,
      });

      const payload = {
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
      const { passwordHash: _, ...safeUser } = user;

      res.status(201).json({
        token,
        user: safeUser,
        dbStatus: getDatabaseStatus(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Account registration failed.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const user = await dbRepo.findUserByEmail(String(email));
      if (!user) {
        res.status(401).json({ error: 'No account found with this email. Please register first or check your email.' });
        return;
      }

      const validPassword = bcrypt.compareSync(String(password), user.passwordHash);
      if (!validPassword) {
        res.status(401).json({ error: 'Invalid password. Please try again or reset your password.' });
        return;
      }

      const payload = {
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
      const { passwordHash: _, ...safeUser } = user;

      res.json({
        token,
        user: safeUser,
        dbStatus: getDatabaseStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Authentication failed.' });
    }
  });

  app.post('/api/auth/autostart', async (_req, res) => {
    try {
      const { email } = getAdminCredentials();
      let user = await dbRepo.findUserByEmail(email);
      if (!user) {
        const team = await dbRepo.listTeam();
        if (team.length > 0) {
          user = await dbRepo.findUserByEmail(team[0].email);
        }
      }
      if (!user) {
        res.status(401).json({ error: 'No workspace administrator configured.' });
        return;
      }
      const payload = {
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
      const { passwordHash: _, ...safeUser } = user;
      res.json({
        token,
        user: safeUser,
        dbStatus: getDatabaseStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Autostart session failed.' });
    }
  });

  app.post('/api/auth/google', async (req, res) => {
    try {
      const { uid, email, name } = req.body || {};
      if (!email) {
        res.status(400).json({ error: 'Google account email is required.' });
        return;
      }
      const user = await dbRepo.upsertGoogleUser({
        uid: String(uid || ''),
        email: String(email),
        name: String(name || email.split('@')[0]),
      });

      const payload = {
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
      const { passwordHash: _, ...safeUser } = user;

      res.json({
        token,
        user: safeUser,
        dbStatus: getDatabaseStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Google authentication failed.' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { email, newPassword } = req.body || {};
      if (!email || !newPassword) {
        res.status(400).json({ error: 'Email and new password are required.' });
        return;
      }
      await dbRepo.resetUserPassword(String(email), String(newPassword));
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Password reset failed.' });
    }
  });

  app.get('/api/auth/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const user = await dbRepo.findUserByUid(req.user!.uid);
      if (!user) {
        res.status(401).json({ error: 'User account no longer exists.' });
        return;
      }
      const { passwordHash: _, ...safeUser } = user;
      res.json({
        user: safeUser,
        dbStatus: getDatabaseStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch current user.' });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ success: true });
  });

  // 3. Full State Bootstrap for Authenticated Session
  app.get('/api/bootstrap', authenticateToken, async (_req, res) => {
    try {
      const [
        products,
        suppliers,
        customers,
        purchases,
        sales,
        payments,
        movements,
        team,
        settings,
      ] = await Promise.all([
        dbRepo.listProducts(),
        dbRepo.listSuppliers(),
        dbRepo.listCustomers(),
        dbRepo.listPurchases(),
        dbRepo.listSales(),
        dbRepo.listPayments(),
        dbRepo.listMovements(),
        dbRepo.listTeam(),
        dbRepo.getSettings(),
      ]);

      res.json({
        products,
        suppliers,
        customers,
        purchases,
        sales,
        payments,
        movements,
        team,
        settings,
        dbStatus: getDatabaseStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load operational data.' });
    }
  });

  // 4. Dashboard Summary & Period Analytics
  app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
      const period = ((req.query.period as string) || 'all') as DatePeriodFilter;
      const [products, sales, purchases] = await Promise.all([
        dbRepo.listProducts(),
        dbRepo.listSales(),
        dbRepo.listPurchases(),
      ]);

      const metrics = computeDashboardMetrics(products, sales, purchases, period);
      const filteredSales = filterRecordsByPeriod(sales, period);
      const filteredPurchases = filterRecordsByPeriod(purchases, period);

      res.json({
        period,
        metrics,
        recentSales: filteredSales.slice(0, 8),
        recentPurchases: filteredPurchases.slice(0, 8),
        lowStockProducts: products.filter((p) => p.quantity <= p.minStockLevel),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to compute dashboard metrics.' });
    }
  });

  // 5. Products CRUD
  app.get('/api/products', async (_req, res) => {
    try {
      const products = await dbRepo.listProducts();
      res.json({ products });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list products.' });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const product = await dbRepo.getProductById(req.params.id);
      if (!product) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      res.json({ product });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch product.' });
    }
  });

  app.post(
    '/api/products',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager', 'Inventory Clerk']),
    async (req, res) => {
      try {
        const product = await dbRepo.createProduct(req.body);
        const movements = await dbRepo.listMovements();
        res.status(201).json({ product, movements });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to create product.' });
      }
    }
  );

  app.put(
    '/api/products/:id',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager', 'Inventory Clerk']),
    async (req, res) => {
      try {
        const product = await dbRepo.updateProduct(String(req.params.id), req.body);
        res.json({ product });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to update product.' });
      }
    }
  );

  app.delete(
    '/api/products/:id',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager']),
    async (req, res) => {
      try {
        await dbRepo.deleteProduct(String(req.params.id));
        res.json({ success: true });
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete product.' });
      }
    }
  );

  // 6. Inventory Movements & Adjustments
  app.get('/api/inventory/movements', authenticateToken, async (_req, res) => {
    try {
      const movements = await dbRepo.listMovements();
      res.json({ movements });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch stock movements.' });
    }
  });

  app.post(
    '/api/inventory/adjust',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager', 'Inventory Clerk']),
    async (req, res) => {
      try {
        const result = await dbRepo.adjustStock(req.body);
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Stock adjustment failed.' });
      }
    }
  );

  // 7. Suppliers CRUD
  app.get('/api/suppliers', authenticateToken, async (_req, res) => {
    try {
      const suppliers = await dbRepo.listSuppliers();
      res.json({ suppliers });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch suppliers.' });
    }
  });

  app.post(
    '/api/suppliers',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager']),
    async (req, res) => {
      try {
        const supplier = await dbRepo.createSupplier(req.body);
        res.status(201).json({ supplier });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to create supplier.' });
      }
    }
  );

  app.put(
    '/api/suppliers/:id',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager']),
    async (req, res) => {
      try {
        const supplier = await dbRepo.updateSupplier(String(req.params.id), req.body);
        res.json({ supplier });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to update supplier.' });
      }
    }
  );

  app.delete(
    '/api/suppliers/:id',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager']),
    async (req, res) => {
      try {
        await dbRepo.deleteSupplier(String(req.params.id));
        res.json({ success: true });
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete supplier.' });
      }
    }
  );

  // 8. Customers CRUD
  app.get('/api/customers', authenticateToken, async (_req, res) => {
    try {
      const customers = await dbRepo.listCustomers();
      res.json({ customers });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch customers.' });
    }
  });

  app.post(
    '/api/customers',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager', 'Billing Executive']),
    async (req, res) => {
      try {
        const customer = await dbRepo.createCustomer(req.body);
        res.status(201).json({ customer });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to create customer.' });
      }
    }
  );

  app.put(
    '/api/customers/:id',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager', 'Billing Executive']),
    async (req, res) => {
      try {
        const customer = await dbRepo.updateCustomer(String(req.params.id), req.body);
        res.json({ customer });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to update customer.' });
      }
    }
  );

  app.delete(
    '/api/customers/:id',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager']),
    async (req, res) => {
      try {
        await dbRepo.deleteCustomer(String(req.params.id));
        res.json({ success: true });
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete customer.' });
      }
    }
  );

  // 9. Purchases
  app.get('/api/purchases', authenticateToken, async (_req, res) => {
    try {
      const purchases = await dbRepo.listPurchases();
      res.json({ purchases });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch purchases.' });
    }
  });

  app.post(
    '/api/purchases',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager', 'Inventory Clerk']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const purchase = await dbRepo.createPurchase({
          ...req.body,
          recordedBy: req.user?.name || 'Admin',
        });
        const [products, movements, payments] = await Promise.all([
          dbRepo.listProducts(),
          dbRepo.listMovements(),
          dbRepo.listPayments(),
        ]);
        res.status(201).json({ purchase, products, movements, payments });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to record purchase order.' });
      }
    }
  );

  // 10. Sales & Invoices
  app.get('/api/sales', authenticateToken, async (_req, res) => {
    try {
      const sales = await dbRepo.listSales();
      res.json({ sales });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch sales.' });
    }
  });

  app.get('/api/invoices', authenticateToken, async (_req, res) => {
    try {
      const invoices = await dbRepo.listSales();
      res.json({ invoices });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch invoices.' });
    }
  });

  app.get('/api/invoices/:id', authenticateToken, async (req, res) => {
    try {
      const invoice = await dbRepo.getSaleById(String(req.params.id));
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found.' });
        return;
      }
      res.json({ invoice });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch invoice.' });
    }
  });

  app.get('/api/invoices/:id/print', authenticateToken, async (req, res) => {
    try {
      const [invoice, settings, customers] = await Promise.all([
        dbRepo.getSaleById(String(req.params.id)),
        dbRepo.getSettings(),
        dbRepo.listCustomers(),
      ]);
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found.' });
        return;
      }
      const customer = customers.find((c) => c.id === invoice.customerId) || null;
      const copyType =
        (req.query.copyType as InvoiceCopyType) || 'ORIGINAL FOR RECIPIENT';
      const paperFormat = (req.query.paperFormat as PrintPaperFormat) || 'a4';
      const taxSplitMode =
        req.query.taxSplitMode === 'igst' ? 'igst' : 'cgst_sgst';

      const html = buildPrintableInvoiceHtml(invoice, settings, customer, {
        copyType,
        paperFormat,
        taxSplitMode,
      });

      if (req.query.format === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        return;
      }

      res.json({
        invoice,
        customer,
        settings,
        amountInWords: numberToIndianWords(invoice.grandTotal, settings.currencySymbol),
        html,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to generate printable invoice.' });
    }
  });

  app.get('/api/purchases/:id/print', authenticateToken, async (req, res) => {
    try {
      const [purchases, settings, suppliers] = await Promise.all([
        dbRepo.listPurchases(),
        dbRepo.getSettings(),
        dbRepo.listSuppliers(),
      ]);
      const po = purchases.find((p) => p.id === String(req.params.id));
      if (!po) {
        res.status(404).json({ error: 'Purchase order not found.' });
        return;
      }
      const supplier = suppliers.find((s) => s.id === po.supplierId) || null;
      const html = buildPrintablePurchaseOrderHtml(po, settings, supplier, po.items || []);

      if (req.query.format === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        return;
      }

      res.json({
        purchaseOrder: po,
        supplier,
        settings,
        amountInWords: numberToIndianWords(po.totalAmount, settings.currencySymbol),
        html,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to generate printable purchase order.' });
    }
  });

  app.get('/api/analytics/summary', authenticateToken, async (_req, res) => {
    try {
      const [products, sales, purchases, customers, suppliers, settings] = await Promise.all([
        dbRepo.listProducts(),
        dbRepo.listSales(),
        dbRepo.listPurchases(),
        dbRepo.listCustomers(),
        dbRepo.listSuppliers(),
        dbRepo.getSettings(),
      ]);
      const metrics = computeDashboardMetrics(products, sales, purchases);
      const lowStockSummary = evaluateLowStockAlerts(products, settings.lowStockGlobalThreshold);
      const totalCollected = sales.reduce(
        (sum, s) =>
          sum +
          (typeof s.amountPaid === 'number'
            ? s.amountPaid
            : s.paymentStatus === 'Paid'
            ? s.grandTotal
            : 0),
        0
      );
      const collectionRatePct =
        metrics.totalSalesRevenue > 0
          ? Number(((totalCollected / metrics.totalSalesRevenue) * 100).toFixed(1))
          : 100;

      res.json({
        metrics,
        lowStockSummary,
        totalCollected: Number(totalCollected.toFixed(2)),
        collectionRatePct,
        counts: {
          products: products.length,
          sales: sales.length,
          purchases: purchases.length,
          customers: customers.length,
          suppliers: suppliers.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to compute analytics summary.' });
    }
  });

  app.post(
    '/api/sales',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager', 'Billing Executive']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const invoice = await dbRepo.createSale({
          ...req.body,
          recordedBy: req.user?.name || 'Billing Desk',
        });
        const [products, customers, movements, payments] = await Promise.all([
          dbRepo.listProducts(),
          dbRepo.listCustomers(),
          dbRepo.listMovements(),
          dbRepo.listPayments(),
        ]);
        res.status(201).json({ invoice, products, customers, movements, payments });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to create sale invoice.' });
      }
    }
  );

  // 11. Payments
  app.get('/api/payments', authenticateToken, async (_req, res) => {
    try {
      const payments = await dbRepo.listPayments();
      res.json({ payments });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch payments.' });
    }
  });

  app.post(
    '/api/payments',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager', 'Billing Executive']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await dbRepo.recordPayment({
          ...req.body,
          recordedBy: req.user?.name || 'Billing Desk',
        });
        const [sales, customers, payments] = await Promise.all([
          dbRepo.listSales(),
          dbRepo.listCustomers(),
          dbRepo.listPayments(),
        ]);
        res.status(201).json({ ...result, sales, customers, payments });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to record payment.' });
      }
    }
  );

  // 12. Team Management
  app.get('/api/team', authenticateToken, async (_req, res) => {
    try {
      const team = await dbRepo.listTeam();
      res.json({ team });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch team members.' });
    }
  });

  app.post('/api/team', authenticateToken, requireRoles(['Admin']), async (req, res) => {
    try {
      const member = await dbRepo.createTeamMember(req.body);
      res.status(201).json({ member });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create team member.' });
    }
  });

  app.put('/api/team/:uid', authenticateToken, requireRoles(['Admin']), async (req, res) => {
    try {
      const member = await dbRepo.updateTeamMember(String(req.params.uid), req.body);
      res.json({ member });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update team member.' });
    }
  });

  app.delete('/api/team/:uid', authenticateToken, requireRoles(['Admin']), async (req, res) => {
    try {
      await dbRepo.deleteTeamMember(String(req.params.uid));
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete team member.' });
    }
  });

  // 13. Business Settings & Reset
  app.get('/api/settings', authenticateToken, async (_req, res) => {
    try {
      const settings = await dbRepo.getSettings();
      res.json({ settings });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch settings.' });
    }
  });

  app.put(
    '/api/settings',
    authenticateToken,
    requireRoles(['Admin', 'Store Manager']),
    async (req, res) => {
      try {
        const settings = await dbRepo.updateSettings(req.body);
        res.json({ settings });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to update settings.' });
      }
    }
  );

  app.post('/api/reset', authenticateToken, requireRoles(['Admin']), async (_req, res) => {
    try {
      await dbRepo.resetDemoData();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to reset data.' });
    }
  });

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const status = getDatabaseStatus();
    console.log(
      `[BuildFlow Supply] Server listening on http://0.0.0.0:${PORT} | DB Engine: ${status.engine}`
    );
  });
}

// Only start listening when executed directly (not imported by unit tests)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
