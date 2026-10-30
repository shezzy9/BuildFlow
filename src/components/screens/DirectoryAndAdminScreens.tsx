import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Download,
  CheckCircle2,
  UserPlus,
  Eye,
  Database,
  RotateCcw,
  Printer,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useStore } from '../../context/StoreContext';
import { Customer, Supplier, TeamMember, UserRole } from '../../types';
import { computeDashboardMetrics, formatCurrency } from '../../utils/inventoryLogic';
import {
  exportProductsToCsv,
  exportSalesHistoryToCsv,
  exportSuppliersToCsv,
  exportCustomersToCsv,
} from '../../utils/exportUtils';
import {
  Button,
  Dialog,
  EmptyState,
  Input,
  MetricTile,
  PageHeading,
  Select,
  StatusIndicator,
} from '../ui/Primitives';

// ============================================================================
// SCREEN 11: SUPPLIERS MANAGEMENT (Full CRUD + Purchase History)
// ============================================================================
export const SuppliersScreen: React.FC = () => {
  const { suppliers, purchases, settings, saveSupplier, deleteSupplier, addToast } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [gstin, setGstin] = useState('');
  const [category, setCategory] = useState('Cement');
  const [leadTimeDays, setLeadTimeDays] = useState('3');
  const [status, setStatus] = useState<'Active' | 'On Hold'>('Active');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const openModal = (sup?: Supplier) => {
    setFormError('');
    if (sup) {
      setEditing(sup);
      setName(sup.name);
      setCode(sup.code);
      setContactPerson(sup.contactPerson);
      setPhone(sup.phone);
      setEmail(sup.email);
      setAddress(sup.address || '');
      setCity(sup.city);
      setGstin(sup.gstin || '');
      setCategory(sup.category);
      setLeadTimeDays(String(sup.leadTimeDays));
      setStatus(sup.status);
      setNotes(sup.notes || '');
    } else {
      setEditing(null);
      setName('');
      setCode(`SUP-0${suppliers.length + 1}`);
      setContactPerson('');
      setPhone('+91 80 4120 8800');
      setEmail('');
      setAddress('');
      setCity('Bengaluru, KA');
      setGstin('29AAACU1234F1Z2');
      setCategory('Cement');
      setLeadTimeDays('3');
      setStatus('Active');
      setNotes('');
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contactPerson.trim() || !email.trim()) {
      setFormError('Supplier name, contact person, and email are required.');
      return;
    }
    await saveSupplier({
      id: editing?.id,
      name: name.trim(),
      code: code.trim() || 'SUP-NEW',
      contactPerson: contactPerson.trim(),
      phone: phone.trim() || '+91 80 4120 8800',
      email: email.trim(),
      address: address.trim(),
      city: city.trim() || 'Bengaluru, KA',
      gstin: gstin.trim() || '29AAACU1234F1Z2',
      category,
      leadTimeDays: Math.max(1, parseInt(leadTimeDays, 10) || 3),
      rating: editing?.rating || 4.8,
      status,
      notes: notes.trim(),
    });
    setModalOpen(false);
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.contactPerson.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q)
    );
  }, [suppliers, searchQuery]);

  const supplierPurchases = useMemo(() => {
    if (!historySupplier) return [];
    return purchases.filter(
      (p) => p.supplierId === historySupplier.id || p.supplierName === historySupplier.name
    );
  }, [purchases, historySupplier]);

  return (
    <div className="space-y-6">
      <PageHeading
        kicker="APPROVED MILLS & MANUFACTURERS"
        title="Suppliers"
        subtitle="Manage building material manufacturers, GSTIN registrations, lead times, and procurement history."
        actions={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                if (filtered.length === 0) {
                  addToast('No suppliers to export', 'Add suppliers first to export a CSV directory.', 'warning');
                  return;
                }
                const dateStamp = new Date().toISOString().slice(0, 10);
                exportSuppliersToCsv(filtered, `buildflow_suppliers_${dateStamp}.csv`);
                addToast('Exported to CSV', `Downloaded ${filtered.length} supplier record(s).`, 'success');
              }}
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </Button>
            <Button variant="primary" size="md" onClick={() => openModal()}>
              <Plus className="w-4 h-4" />
              <span>Add Supplier</span>
            </Button>
          </>
        }
      />

      <div className="bg-[#FFFFFF] border border-[#E7E4DC]">
        <div className="p-4 border-b border-[#E7E4DC] flex items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#777A73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search suppliers"
              placeholder="Search supplier name, code, division..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#315744]"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No suppliers found"
            description="Add a material manufacturer or wholesale distributor to begin logging purchase orders."
            actionLabel="Add Supplier"
            onAction={() => openModal()}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                  <th className="py-3 px-4">CODE</th>
                  <th className="py-3 px-4">SUPPLIER / MILL NAME</th>
                  <th className="py-3 px-4">DIVISION</th>
                  <th className="py-3 px-4">PRIMARY CONTACT</th>
                  <th className="py-3 px-4">CITY & GSTIN</th>
                  <th className="py-3 px-4 text-right">LEAD TIME</th>
                  <th className="py-3 px-4">STATUS</th>
                  <th className="py-3 px-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E4DC] text-xs">
                {filtered.map((sup) => (
                  <tr key={sup.id} className="hover:bg-[#F7F6F2]/60">
                    <td className="py-3 px-4 font-mono text-[#777A73] whitespace-nowrap">
                      {sup.code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#252923]">{sup.name}</div>
                      {sup.address && (
                        <div className="text-[11px] text-[#777A73] truncate max-w-[220px]">
                          {sup.address}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#252923]">{sup.category}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#252923]">
                        {sup.contactPerson}
                      </div>
                      <div className="text-[11px] text-[#777A73]">
                        {sup.email} · {sup.phone}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-[#252923]">{sup.city}</div>
                      {sup.gstin && (
                        <div className="text-[11px] font-mono text-[#777A73]">
                          {sup.gstin}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#252923]">
                      {sup.leadTimeDays} days
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusIndicator status={sup.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setHistorySupplier(sup)}
                          title={`Purchase history for ${sup.name}`}
                          className="px-2 py-1 text-[11px] font-medium text-[#315744] bg-[#EDF3F0] hover:bg-[#315744] hover:text-[#FFFFFF] transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>PO History</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openModal(sup)}
                          aria-label={`Edit ${sup.name}`}
                          className="p-1.5 text-[#777A73] hover:text-[#252923] hover:bg-[#EFEEE8] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteSupplier(sup.id)}
                          aria-label={`Delete ${sup.name}`}
                          className="p-1.5 text-[#777A73] hover:text-[#9E3B24] hover:bg-[#FDF3F1] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Add/Edit Supplier Modal */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Supplier' : 'Add Material Supplier'}
        subtitle="Enter supplier contact details, GSTIN, primary material division, and standard lead time."
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <div className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-xs text-[#9E3B24]">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Supplier / Mill Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Supplier Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <Input
              label="Contact Person"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              required
            />
            <Input
              label="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="GSTIN / Tax Registration"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
            />
            <Input
              label="City / Region"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <Input
              label="Plant / Depot Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Select
              label="Primary Material Division"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={[
                { value: 'Cement', label: 'Cement' },
                { value: 'Steel', label: 'Steel' },
                { value: 'Bricks', label: 'Bricks' },
                { value: 'Pipes', label: 'Pipes' },
                { value: 'Timber', label: 'Timber' },
                { value: 'Aggregates', label: 'Aggregates' },
              ]}
            />
            <Input
              label="Lead Time (Days)"
              type="number"
              min="1"
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Account Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'Active' | 'On Hold')}
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'On Hold', label: 'On Hold' },
              ]}
            />
            <Input
              label="Procurement Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dispatch schedules, minimum order tonnage..."
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E4DC]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Supplier
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Supplier Purchase History Modal */}
      <Dialog
        open={Boolean(historySupplier)}
        onClose={() => setHistorySupplier(null)}
        title={historySupplier ? `${historySupplier.name} — Purchase History` : 'Purchase History'}
        subtitle={
          historySupplier
            ? `${historySupplier.code} · ${historySupplier.city} · GSTIN: ${historySupplier.gstin || 'N/A'}`
            : ''
        }
        maxWidth="max-w-2xl"
      >
        {historySupplier && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#F7F6F2] p-3.5 border border-[#E7E4DC] text-xs">
              <div>
                <div className="text-[11px] font-mono text-[#777A73]">TOTAL PURCHASE ORDERS</div>
                <div className="text-sm font-semibold text-[#252923] mt-0.5">
                  {supplierPurchases.length} orders
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono text-[#777A73]">CUMULATIVE PROCUREMENT</div>
                <div className="text-sm font-semibold font-mono text-[#315744] mt-0.5">
                  {formatCurrency(
                    supplierPurchases.reduce((s, p) => s + (p.totalAmount ?? p.totalCost ?? 0), 0),
                    settings.currencySymbol
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono text-[#777A73]">PRIMARY CONTACT</div>
                <div className="text-xs font-medium text-[#252923] mt-0.5">
                  {historySupplier.contactPerson} ({historySupplier.phone})
                </div>
              </div>
            </div>

            {supplierPurchases.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#777A73] border border-[#E7E4DC]">
                No purchase orders recorded for this supplier yet.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#E7E4DC]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[10px] font-mono text-[#777A73]">
                      <th className="py-2.5 px-3">PO #</th>
                      <th className="py-2.5 px-3">DATE</th>
                      <th className="py-2.5 px-3">MATERIALS</th>
                      <th className="py-2.5 px-3 text-right">QTY</th>
                      <th className="py-2.5 px-3 text-right">TOTAL (INC. GST)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E4DC]">
                    {supplierPurchases.map((po) => (
                      <tr key={po.id}>
                        <td className="py-2.5 px-3 font-mono font-medium text-[#252923]">
                          {po.poNumber || po.purchaseNumber}
                        </td>
                        <td className="py-2.5 px-3 text-[#777A73]">
                          {(po.createdAt || po.date || '').slice(0, 10)}
                        </td>
                        <td className="py-2.5 px-3 text-[#252923]">
                          {po.productName}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#252923]">
                          +{po.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#252923]">
                          {formatCurrency(po.totalAmount ?? po.totalCost ?? 0, settings.currencySymbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
};

// ============================================================================
// SCREEN 12: CUSTOMERS MANAGEMENT (Full CRUD + Sales History)
// ============================================================================
export const CustomersScreen: React.FC = () => {
  const {
    customers,
    sales,
    settings,
    saveCustomer,
    deleteCustomer,
    setSelectedInvoice,
    setScreen,
    addToast,
  } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [gstOrTaxId, setGstOrTaxId] = useState('');
  const [creditLimit, setCreditLimit] = useState('250000');
  const [outstandingBalance, setOutstandingBalance] = useState('0');
  const [tier, setTier] = useState<Customer['tier']>('Contractor');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const openModal = (cust?: Customer) => {
    setFormError('');
    if (cust) {
      setEditing(cust);
      setName(cust.name);
      setCompany(cust.company);
      setPhone(cust.phone);
      setEmail(cust.email);
      setAddress(cust.address || '');
      setCity(cust.city);
      setGstOrTaxId(cust.gstOrTaxId);
      setCreditLimit(String(cust.creditLimit));
      setOutstandingBalance(String(cust.outstandingBalance));
      setTier(cust.tier);
      setNotes(cust.notes || '');
    } else {
      setEditing(null);
      setName('');
      setCompany('');
      setPhone('+91 98450 11220');
      setEmail('');
      setAddress('');
      setCity('Bengaluru, KA');
      setGstOrTaxId('29AAACB1902P1Z8');
      setCreditLimit('250000');
      setOutstandingBalance('0');
      setTier('Contractor');
      setNotes('');
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !company.trim() || !email.trim()) {
      setFormError('Contact name, company name, and email are required.');
      return;
    }
    await saveCustomer({
      id: editing?.id,
      name: name.trim(),
      company: company.trim(),
      phone: phone.trim() || '+91 98450 11220',
      email: email.trim(),
      address: address.trim(),
      city: city.trim() || 'Bengaluru, KA',
      gstOrTaxId: gstOrTaxId.trim() || '29AAACB1902P1Z8',
      creditLimit: Math.max(0, parseFloat(creditLimit) || 0),
      outstandingBalance: Math.max(0, parseFloat(outstandingBalance) || 0),
      tier,
      notes: notes.trim(),
    });
    setModalOpen(false);
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.tier.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const customerSales = useMemo(() => {
    if (!historyCustomer) return [];
    return sales.filter(
      (s) =>
        s.customerId === historyCustomer.id ||
        s.customerCompany === historyCustomer.company ||
        s.customerName === historyCustomer.name
    );
  }, [sales, historyCustomer]);

  return (
    <div className="space-y-6">
      <PageHeading
        kicker="CONTRACTORS, ARCHITECTS & DEVELOPERS"
        title="Customers"
        subtitle="Manage trade customer accounts, GSTIN numbers, credit limits, and invoice history."
        actions={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                if (filtered.length === 0) {
                  addToast('No customers to export', 'Add customer accounts first to export a CSV directory.', 'warning');
                  return;
                }
                const dateStamp = new Date().toISOString().slice(0, 10);
                exportCustomersToCsv(filtered, `buildflow_customers_${dateStamp}.csv`);
                addToast('Exported to CSV', `Downloaded ${filtered.length} customer record(s).`, 'success');
              }}
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </Button>
            <Button variant="primary" size="md" onClick={() => openModal()}>
              <Plus className="w-4 h-4" />
              <span>Add Customer</span>
            </Button>
          </>
        }
      />

      <div className="bg-[#FFFFFF] border border-[#E7E4DC]">
        <div className="p-4 border-b border-[#E7E4DC] flex items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#777A73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search customers"
              placeholder="Search company, contact, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F7F6F2] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#315744]"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No customer accounts found"
            description="Register trade contractors and architectural firms for faster counter billing."
            actionLabel="Add Customer"
            onAction={() => openModal()}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                  <th className="py-3 px-4">COMPANY / ORGANIZATION</th>
                  <th className="py-3 px-4">ACCOUNT TIER</th>
                  <th className="py-3 px-4">PRIMARY CONTACT</th>
                  <th className="py-3 px-4">GSTIN / TAX ID</th>
                  <th className="py-3 px-4 text-right">CREDIT LIMIT</th>
                  <th className="py-3 px-4 text-right">OUTSTANDING</th>
                  <th className="py-3 px-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E4DC] text-xs">
                {filtered.map((cust) => (
                  <tr key={cust.id} className="hover:bg-[#F7F6F2]/60">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#252923]">
                        {cust.company}
                      </div>
                      <div className="text-[11px] text-[#777A73]">{cust.city}</div>
                    </td>
                    <td className="py-3 px-4 text-[#252923]">{cust.tier}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#252923]">{cust.name}</div>
                      <div className="text-[11px] text-[#777A73]">
                        {cust.email} · {cust.phone}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#777A73]">
                      {cust.gstOrTaxId}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#777A73]">
                      {formatCurrency(cust.creditLimit, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#252923]">
                      {formatCurrency(cust.outstandingBalance, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setHistoryCustomer(cust)}
                          title={`Invoice history for ${cust.company}`}
                          className="px-2 py-1 text-[11px] font-medium text-[#315744] bg-[#EDF3F0] hover:bg-[#315744] hover:text-[#FFFFFF] transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Invoices</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openModal(cust)}
                          aria-label={`Edit ${cust.company}`}
                          className="p-1.5 text-[#777A73] hover:text-[#252923] hover:bg-[#EFEEE8] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteCustomer(cust.id)}
                          aria-label={`Delete ${cust.company}`}
                          className="p-1.5 text-[#777A73] hover:text-[#9E3B24] hover:bg-[#FDF3F1] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Add/Edit Customer Modal */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Customer Account' : 'Add Trade Customer'}
        subtitle="Configure contractor company details, GSTIN, delivery address, and trade credit limit."
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <div className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-xs text-[#9E3B24]">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Company / Studio Name"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
            />
            <Input
              label="Primary Contact Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <Input
              label="Billing / Site Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Input
              label="GSTIN / Tax ID Number"
              value={gstOrTaxId}
              onChange={(e) => setGstOrTaxId(e.target.value)}
            />
            <Select
              label="Account Tier"
              value={tier}
              onChange={(e) => setTier(e.target.value as Customer['tier'])}
              options={[
                { value: 'Contractor', label: 'Contractor' },
                { value: 'Architectural Firm', label: 'Architectural Firm' },
                { value: 'Developer', label: 'Developer' },
                { value: 'Retail', label: 'Retail' },
              ]}
            />
            <Input
              label={`Credit Limit (${settings.currencySymbol})`}
              type="number"
              min="0"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
            />
            <Input
              label="Account Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Site delivery instructions, credit terms..."
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E4DC]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Customer
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Customer Sales History Modal */}
      <Dialog
        open={Boolean(historyCustomer)}
        onClose={() => setHistoryCustomer(null)}
        title={historyCustomer ? `${historyCustomer.company} — Invoice History` : 'Invoice History'}
        subtitle={
          historyCustomer
            ? `${historyCustomer.name} · ${historyCustomer.city} · GSTIN: ${historyCustomer.gstOrTaxId}`
            : ''
        }
        maxWidth="max-w-2xl"
      >
        {historyCustomer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#F7F6F2] p-3.5 border border-[#E7E4DC] text-xs">
              <div>
                <div className="text-[11px] font-mono text-[#777A73]">TOTAL BILLED</div>
                <div className="text-sm font-semibold font-mono text-[#315744] mt-0.5">
                  {formatCurrency(
                    customerSales.reduce((s, inv) => s + inv.grandTotal, 0),
                    settings.currencySymbol
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono text-[#777A73]">OUTSTANDING BALANCE</div>
                <div className="text-sm font-semibold font-mono text-[#9E3B24] mt-0.5">
                  {formatCurrency(historyCustomer.outstandingBalance, settings.currencySymbol)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono text-[#777A73]">CREDIT LIMIT</div>
                <div className="text-sm font-semibold font-mono text-[#252923] mt-0.5">
                  {formatCurrency(historyCustomer.creditLimit, settings.currencySymbol)}
                </div>
              </div>
            </div>

            {customerSales.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#777A73] border border-[#E7E4DC]">
                No sales invoices recorded for this customer yet.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#E7E4DC]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[10px] font-mono text-[#777A73]">
                      <th className="py-2.5 px-3">INVOICE #</th>
                      <th className="py-2.5 px-3">DATE</th>
                      <th className="py-2.5 px-3">STATUS</th>
                      <th className="py-2.5 px-3 text-right">GRAND TOTAL</th>
                      <th className="py-2.5 px-3 text-right">BALANCE DUE</th>
                      <th className="py-2.5 px-3 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E4DC]">
                    {customerSales.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[#F7F6F2]/60">
                        <td className="py-2.5 px-3 font-mono font-medium text-[#252923]">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-2.5 px-3 text-[#777A73]">
                          {(inv.createdAt || inv.date || '').slice(0, 10)}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusIndicator status={inv.paymentStatus} />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#252923]">
                          {formatCurrency(inv.grandTotal, settings.currencySymbol)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#9E3B24]">
                          {formatCurrency(inv.balanceDue ?? 0, settings.currencySymbol)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setHistoryCustomer(null);
                              setScreen('invoice-detail');
                            }}
                            className="px-2 py-1 text-[11px] font-medium text-[#315744] bg-[#EDF3F0] hover:bg-[#315744] hover:text-[#FFFFFF] transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3" />
                            <span>View / Print</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
};

// ============================================================================
// SCREEN 13: REPORTS & ANALYTICS
// ============================================================================
export const ReportsScreen: React.FC = () => {
  const { products, sales, purchases, settings, addToast } = useStore();

  const metrics = useMemo(
    () => computeDashboardMetrics(products, sales, purchases),
    [products, sales, purchases]
  );

  // Category Breakdown from persisted products
  const categoryBreakdown = useMemo(() => {
    const categories = ['Cement', 'Steel', 'Bricks', 'Pipes', 'Timber', 'Aggregates'];
    return categories.map((cat) => {
      const items = products.filter((p) => p.category === cat);
      const stockCost = items.reduce(
        (sum, p) => sum + p.quantity * p.purchasePrice,
        0
      );
      const retailValue = items.reduce(
        (sum, p) => sum + p.quantity * p.sellingPrice,
        0
      );
      return {
        category: cat,
        stockCost: Number(stockCost.toFixed(0)),
        retailValue: Number(retailValue.toFixed(0)),
        skuCount: items.length,
      };
    });
  }, [products]);

  const handleExportCsv = () => {
    if (products.length === 0) {
      addToast('No products to export', 'Add products to your catalogue to export a valuation report.', 'warning');
      return;
    }
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportProductsToCsv(products, `buildflow_inventory_report_${dateStamp}.csv`);
    addToast('Report exported', 'Inventory valuation CSV downloaded.', 'success');
  };

  const handleExportSalesCsv = () => {
    if (sales.length === 0) {
      addToast('No sales to export', 'Record a sale invoice first to export a sales ledger CSV.', 'warning');
      return;
    }
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportSalesHistoryToCsv(sales, `buildflow_sales_report_${dateStamp}.csv`);
    addToast('Sales CSV exported', 'Sales ledger CSV downloaded.', 'success');
  };

  return (
    <div className="space-y-8">
      <PageHeading
        kicker="BUSINESS INTELLIGENCE & LEDGER REPORTS"
        title="Reports & Analytics"
        subtitle="Financial summary, category stock valuation, and unit margin analysis based on persisted records."
        actions={
          <>
            <Button variant="outline" size="md" onClick={handleExportSalesCsv}>
              <Download className="w-4 h-4" />
              <span>Export Sales CSV</span>
            </Button>
            <Button variant="outline" size="md" onClick={handleExportCsv}>
              <Download className="w-4 h-4" />
              <span>Export Inventory CSV</span>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricTile
          label="Gross Sales Revenue"
          value={formatCurrency(metrics.totalSalesRevenue, settings.currencySymbol)}
          meta={`Across ${sales.length} invoices`}
          accent="green"
        />
        <MetricTile
          label="Procurement Spend"
          value={formatCurrency(metrics.totalPurchasesSpend, settings.currencySymbol)}
          meta={`Across ${purchases.length} purchase orders`}
        />
        <MetricTile
          label="Inventory Cost Valuation"
          value={formatCurrency(metrics.inventoryValuation, settings.currencySymbol)}
          meta="Current stock at landed purchase price"
        />
        <MetricTile
          label="Projected Retail Value"
          value={formatCurrency(
            products.reduce((s, p) => s + p.quantity * p.sellingPrice, 0),
            settings.currencySymbol
          )}
          meta="Current stock at trade selling price"
          accent="green"
        />
      </div>

      {/* Category Valuation Chart */}
      <div className="bg-[#FFFFFF] border border-[#E7E4DC] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <div className="text-xs font-mono text-[#777A73]">
              CATEGORY VALUATION COMPARISON
            </div>
            <h2 className="text-base font-semibold text-[#252923] mt-0.5">
              Landed Stock Cost vs. Trade Retail Value by Material Division (
              {settings.currencySymbol})
            </h2>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#777A73]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#777A73] inline-block" />
              <span>Landed Cost</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#315744] inline-block" />
              <span>Retail Value</span>
            </span>
          </div>
        </div>

        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryBreakdown}>
              <CartesianGrid stroke="#E7E4DC" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="category"
                tick={{ fill: '#252923', fontSize: 12 }}
                axisLine={{ stroke: '#E7E4DC' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#777A73', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${settings.currencySymbol}${Number(v).toLocaleString('en-IN')}`}
              />
              <Tooltip
                formatter={(value) =>
                  formatCurrency(Number(value ?? 0), settings.currencySymbol)
                }
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#E7E4DC',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="stockCost" name="Landed Cost" fill="#777A73" />
              <Bar dataKey="retailValue" name="Trade Retail Value" fill="#315744" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SKU Margin Breakdown Table */}
      <div className="bg-[#FFFFFF] border border-[#E7E4DC]">
        <div className="px-6 py-4 border-b border-[#E7E4DC]">
          <h2 className="text-base font-semibold text-[#252923]">
            Unit Margin & Inventory Valuation by Material
          </h2>
          <p className="text-xs text-[#777A73]">
            Detailed unit profitability across all active building materials
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                <th className="py-3 px-4">MATERIAL</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4 text-right">STOCK QTY</th>
                <th className="py-3 px-4 text-right">UNIT COST</th>
                <th className="py-3 px-4 text-right">SELLING PRICE</th>
                <th className="py-3 px-4 text-right">UNIT MARGIN</th>
                <th className="py-3 px-4 text-right">STOCK VALUE (COST)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E4DC] text-xs">
              {products.map((p) => {
                const margin = p.sellingPrice - p.purchasePrice;
                const marginPct =
                  p.sellingPrice > 0 ? (margin / p.sellingPrice) * 100 : 0;
                return (
                  <tr key={p.id} className="hover:bg-[#F7F6F2]/60">
                    <td className="py-3 px-4 font-medium text-[#252923]">{p.name}</td>
                    <td className="py-3 px-4 font-mono text-[#777A73]">{p.sku}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#252923]">
                      {p.quantity} {p.unit.split(' ')[0]}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#777A73]">
                      {formatCurrency(p.purchasePrice, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#252923]">
                      {formatCurrency(p.sellingPrice, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#315744] font-medium">
                      +{formatCurrency(margin, settings.currencySymbol)} ({marginPct.toFixed(1)}%)
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#252923]">
                      {formatCurrency(p.quantity * p.purchasePrice, settings.currencySymbol)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SCREEN 14: TEAM & USER MANAGEMENT
// ============================================================================
export const TeamScreen: React.FC = () => {
  const { team, saveTeamMember, deleteTeamMember, currentUser } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('Store Manager');
  const [department, setDepartment] = useState('Procurement & Silo Logistics');
  const [status, setStatus] = useState<TeamMember['status']>('Active');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');

  const openModal = (member?: TeamMember) => {
    setFormError('');
    setPassword('');
    if (member) {
      setEditing(member);
      setName(member.name);
      setEmail(member.email);
      setPhone(member.phone);
      setRole(member.role);
      setDepartment(member.department);
      setStatus(member.status);
    } else {
      setEditing(null);
      setName('');
      setEmail('');
      setPhone('+91 80 4152 0190');
      setRole('Inventory Clerk');
      setDepartment('Main Yard & Dispatch');
      setStatus('Active');
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setFormError('Full name and workspace email are required.');
      return;
    }
    await saveTeamMember({
      uid: editing?.uid,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      role,
      department: department.trim(),
      status,
      ...(password.trim() ? { password: password.trim() } : {}),
    });
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeading
        kicker="ROLE-BASED ACCESS & YARD STAFF"
        title="Team & User Management"
        subtitle="Assign administrative, store management, inventory clerk, and counter billing permissions."
        actions={
          <Button variant="primary" size="md" onClick={() => openModal()}>
            <UserPlus className="w-4 h-4" />
            <span>Add Team Member</span>
          </Button>
        }
      />

      <div className="bg-[#FFFFFF] border border-[#E7E4DC]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F7F6F2] border-b border-[#E7E4DC] text-[11px] font-mono text-[#777A73]">
                <th className="py-3 px-4">NAME</th>
                <th className="py-3 px-4">EMAIL</th>
                <th className="py-3 px-4">ROLE</th>
                <th className="py-3 px-4">DEPARTMENT / YARD</th>
                <th className="py-3 px-4">STATUS</th>
                <th className="py-3 px-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E4DC] text-xs">
              {team.map((member) => (
                <tr key={member.uid} className="hover:bg-[#F7F6F2]/60">
                  <td className="py-3.5 px-4 font-semibold text-[#252923]">
                    {member.name}
                    {currentUser?.email === member.email && (
                      <span className="ml-2 text-[11px] font-mono text-[#315744]">
                        (You)
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#777A73]">
                    {member.email}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-[#252923]">
                    {member.role}
                  </td>
                  <td className="py-3.5 px-4 text-[#777A73]">
                    {member.department}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <StatusIndicator status={member.status} />
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openModal(member)}
                        aria-label={`Edit ${member.name}`}
                        className="p-1.5 text-[#777A73] hover:text-[#252923] hover:bg-[#EFEEE8] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {member.uid !== 'usr_admin_01' && (
                        <button
                          type="button"
                          onClick={() => void deleteTeamMember(member.uid)}
                          aria-label={`Remove ${member.name}`}
                          className="p-1.5 text-[#777A73] hover:text-[#9E3B24] hover:bg-[#FDF3F1] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Team Member' : 'Invite Team Member'}
        subtitle="Configure staff role permissions, login password, and assigned yard division."
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <div className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-xs text-[#9E3B24]">
              {formError}
            </div>
          )}
          <Input
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Work Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label={editing ? 'New Password (optional)' : 'Initial Login Password'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={editing ? 'Leave blank to keep existing' : 'Default: BuildFlow@2025'}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Operational Role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              options={[
                { value: 'Admin', label: 'Admin' },
                { value: 'Store Manager', label: 'Store Manager' },
                { value: 'Inventory Clerk', label: 'Inventory Clerk' },
                { value: 'Billing Executive', label: 'Billing Executive' },
              ]}
            />
            <Select
              label="Account Status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as TeamMember['status'])
              }
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'On Leave', label: 'On Leave' },
                { value: 'Suspended', label: 'Suspended' },
              ]}
            />
          </div>
          <Input
            label="Department / Yard Sector"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E4DC]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Member
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

// ============================================================================
// SCREEN 15: BUSINESS SETTINGS
// ============================================================================
export const SettingsScreen: React.FC = () => {
  const { settings, dbStatus, saveBusinessSettings, resetToSeedData } = useStore();

  const [businessName, setBusinessName] = useState(settings.businessName);
  const [legalName, setLegalName] = useState(settings.legalName);
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState(
    settings.taxRegistrationNumber
  );
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);
  const [defaultTaxRate, setDefaultTaxRate] = useState(
    String(settings.defaultTaxRate)
  );
  const [invoicePrefix, setInvoicePrefix] = useState(settings.invoicePrefix);
  const [warehouseAddress, setWarehouseAddress] = useState(
    settings.warehouseAddress
  );
  const [contactEmail, setContactEmail] = useState(settings.contactEmail);
  const [contactPhone, setContactPhone] = useState(settings.contactPhone);
  const [lowStockGlobalThreshold, setLowStockGlobalThreshold] = useState(
    String(settings.lowStockGlobalThreshold)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBusinessName(settings.businessName);
    setLegalName(settings.legalName);
    setTaxRegistrationNumber(settings.taxRegistrationNumber);
    setCurrencySymbol(settings.currencySymbol);
    setDefaultTaxRate(String(settings.defaultTaxRate));
    setInvoicePrefix(settings.invoicePrefix);
    setWarehouseAddress(settings.warehouseAddress);
    setContactEmail(settings.contactEmail);
    setContactPhone(settings.contactPhone);
    setLowStockGlobalThreshold(String(settings.lowStockGlobalThreshold));
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveBusinessSettings({
        businessName,
        legalName,
        taxRegistrationNumber,
        currencySymbol,
        currencyCode: currencySymbol === '₹' ? 'INR' : 'USD',
        defaultTaxRate: parseFloat(defaultTaxRate) || 0,
        invoicePrefix,
        warehouseAddress,
        contactEmail,
        contactPhone,
        lowStockGlobalThreshold: parseInt(lowStockGlobalThreshold, 10) || 25,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeading
        kicker="ORGANIZATION & BILLING CONFIGURATION"
        title="Business Settings"
        subtitle="Configure legal company details, GST rates, invoice numbering, and warehouse dispatch address."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void resetToSeedData()}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear Workspace Records</span>
          </Button>
        }
      />

      {/* Database & Environment Secrets Status Panel */}
      {dbStatus && (
        <div className="bg-[#FFFFFF] border border-[#E7E4DC] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#EDF3F0] text-[#315744] border border-[#315744]/20 mt-0.5">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#252923]">
                  Persistence Engine:{' '}
                  {dbStatus.connectedToAtlas
                    ? 'MongoDB Atlas Cloud (buildflow_supply)'
                    : 'Server Persistent Storage (buildflow_supply)'}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono ${
                    dbStatus.connectedToAtlas
                      ? 'bg-[#EDF3F0] text-[#29543D]'
                      : 'bg-[#F7F6F2] text-[#777A73] border border-[#E7E4DC]'
                  }`}
                >
                  {dbStatus.connectedToAtlas ? 'ATLAS LIVE' : 'LOCAL PERSISTENT'}
                </span>
              </div>
              <p className="text-xs text-[#777A73] mt-1">
                {dbStatus.connectedToAtlas
                  ? 'Connected to MongoDB Atlas cluster via MONGODB_URI.'
                  : 'All transactions persist across reloads on the backend server. Configure MONGODB_URI, JWT_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD in AI Studio Secrets for cloud Atlas clustering.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-[#FFFFFF] border border-[#E7E4DC] p-6 sm:p-8 space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input
            label="Brand / Trading Name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
          />
          <Input
            label="Registered Legal Entity Name"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            required
          />
          <Input
            label="GSTIN / Tax Registration Number"
            value={taxRegistrationNumber}
            onChange={(e) => setTaxRegistrationNumber(e.target.value)}
            required
          />
          <Input
            label="Invoice Number Prefix"
            value={invoicePrefix}
            onChange={(e) => setInvoicePrefix(e.target.value)}
            required
          />
          <Select
            label="Currency Symbol"
            value={currencySymbol}
            onChange={(e) => setCurrencySymbol(e.target.value)}
            options={[
              { value: '₹', label: '₹ — Indian Rupee (INR)' },
              { value: '$', label: '$ — US Dollar (USD)' },
              { value: '€', label: '€ — Euro (EUR)' },
              { value: '£', label: '£ — British Pound (GBP)' },
            ]}
          />
          <Input
            label="Default GST / Sales Tax Rate (%)"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={defaultTaxRate}
            onChange={(e) => setDefaultTaxRate(e.target.value)}
            required
          />
          <Input
            label="Dispatch Contact Email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            required
          />
          <Input
            label="Dispatch Contact Phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            required
          />
        </div>

        <Input
          label="Primary Warehouse & Yard Address"
          value={warehouseAddress}
          onChange={(e) => setWarehouseAddress(e.target.value)}
          required
        />

        <div className="max-w-xs">
          <Input
            label="Default Low-Stock Global Threshold"
            type="number"
            min="1"
            value={lowStockGlobalThreshold}
            onChange={(e) => setLowStockGlobalThreshold(e.target.value)}
          />
        </div>

        <div className="pt-4 border-t border-[#E7E4DC] flex justify-end">
          <Button type="submit" variant="primary" disabled={saving}>
            <CheckCircle2 className="w-4 h-4" />
            <span>{saving ? 'Saving Settings...' : 'Save Configuration'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
};
