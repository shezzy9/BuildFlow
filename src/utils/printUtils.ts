import {
  BusinessSettings,
  Customer,
  PurchaseItem,
  PurchaseOrder,
  SaleCartItem,
  SaleInvoice,
  Supplier,
} from '../types';
import { formatCurrency, parseCartItemsSummary } from './inventoryLogic';

export type InvoiceCopyType =
  | 'ORIGINAL FOR RECIPIENT'
  | 'DUPLICATE FOR TRANSPORTER'
  | 'TRIPLICATE FOR SUPPLIER';

export type PrintPaperFormat = 'a4' | 'thermal80';

export interface InvoicePrintOptions {
  copyType?: InvoiceCopyType;
  paperFormat?: PrintPaperFormat;
  taxSplitMode?: 'cgst_sgst' | 'igst';
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function twoDigitsToWords(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const rem = n % 10;
  return `${TENS[ten]}${rem > 0 ? '-' + ONES[rem] : ''}`;
}

function threeDigitsToWords(n: number): string {
  if (n === 0) return '';
  const hundred = Math.floor(n / 100);
  const rem = n % 100;
  const hundredPart = hundred > 0 ? `${ONES[hundred]} Hundred` : '';
  const remPart = twoDigitsToWords(rem);
  if (hundredPart && remPart) return `${hundredPart} ${remPart}`;
  return hundredPart || remPart;
}

/**
 * Converts a numeric currency amount into Indian numbering system words
 * (Crore, Lakh, Thousand, Hundred) for official GST tax invoices.
 */
export function numberToIndianWords(
  amount: number,
  currencySymbol = '₹'
): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const whole = Math.floor(safe);
  const paise = Math.round((safe - whole) * 100);

  const currencyName =
    currencySymbol === '$'
      ? 'Dollars'
      : currencySymbol === '€'
      ? 'Euros'
      : currencySymbol === '£'
      ? 'Pounds'
      : 'Rupees';

  const subUnitName =
    currencySymbol === '$' || currencySymbol === '€'
      ? 'Cents'
      : currencySymbol === '£'
      ? 'Pence'
      : 'Paise';

  if (whole === 0 && paise === 0) {
    return `${currencyName} Zero Only`;
  }

  const parts: string[] = [];
  let remaining = whole;

  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  if (crore > 0) {
    parts.push(`${threeDigitsToWords(crore)} Crore`);
  }

  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  if (lakh > 0) {
    parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  }

  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  if (thousand > 0) {
    parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  }

  if (remaining > 0) {
    parts.push(threeDigitsToWords(remaining));
  }

  const wholeWords = parts.join(' ').trim();
  const paiseWords = paise > 0 ? ` and ${twoDigitsToWords(paise)} ${subUnitName}` : '';

  return `${currencyName} ${wholeWords || 'Zero'}${paiseWords} Only`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getInvoiceLineItems(invoice: SaleInvoice): SaleCartItem[] {
  if (Array.isArray(invoice.items) && invoice.items.length > 0) {
    return invoice.items;
  }
  return parseCartItemsSummary(invoice.itemsSummary, {
    id: invoice.primaryProductId,
    name: invoice.primaryProductName,
    totalQuantity: invoice.totalQuantity,
    subtotal: invoice.subtotal,
  });
}

/**
 * Generates a complete, standalone, print-ready HTML document for a Tax Invoice.
 */
export function buildPrintableInvoiceHtml(
  invoice: SaleInvoice,
  settings: BusinessSettings,
  customer?: Customer | null,
  options: InvoicePrintOptions = {}
): string {
  const copyType = options.copyType || 'ORIGINAL FOR RECIPIENT';
  const paperFormat = options.paperFormat || 'a4';
  const taxSplitMode = options.taxSplitMode || 'cgst_sgst';
  const sym = settings.currencySymbol || '₹';

  const items = getInvoiceLineItems(invoice);
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
  const amountInWords = numberToIndianWords(invoice.grandTotal, sym);
  const issueDate = (invoice.createdAt || invoice.date || new Date().toISOString()).slice(0, 10);

  const rowsHtml = items
    .map(
      (item, idx) => `
      <tr>
        <td class="mono muted">${String(idx + 1).padStart(2, '0')}</td>
        <td>
          <div class="fw-600">${escapeHtml(item.productName)}</div>
          <div class="mono muted small">Category: ${escapeHtml(item.category || 'Building Material')}</div>
        </td>
        <td class="mono">${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.unit)}</td>
        <td class="right mono fw-600">${escapeHtml(item.quantity)}</td>
        <td class="right mono">${escapeHtml(formatCurrency(item.unitPrice, sym))}</td>
        <td class="right mono fw-600">${escapeHtml(formatCurrency(item.lineTotal, sym))}</td>
      </tr>`
    )
    .join('');

  const taxRowsHtml =
    taxSplitMode === 'cgst_sgst'
      ? `
      <div class="summary-row">
        <span class="muted">CGST (${halfTaxRate}%)</span>
        <span class="mono">${escapeHtml(formatCurrency(halfTaxAmount, sym))}</span>
      </div>
      <div class="summary-row">
        <span class="muted">SGST (${halfTaxRate}%)</span>
        <span class="mono">${escapeHtml(formatCurrency(Number((invoice.taxAmount - halfTaxAmount).toFixed(2)), sym))}</span>
      </div>`
      : `
      <div class="summary-row">
        <span class="muted">IGST / Tax (${invoice.taxRate}%)</span>
        <span class="mono">${escapeHtml(formatCurrency(invoice.taxAmount, sym))}</span>
      </div>`;

  const maxWidth = paperFormat === 'thermal80' ? '340px' : '840px';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Tax Invoice ${escapeHtml(invoice.invoiceNumber)} — ${escapeHtml(settings.businessName)}</title>
  <style>
    @page {
      size: ${paperFormat === 'thermal80' ? '80mm auto' : 'A4 portrait'};
      margin: ${paperFormat === 'thermal80' ? '4mm' : '12mm'};
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 24px;
      background: #F7F6F2;
      color: #252923;
      font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.5;
    }
    .toolbar {
      max-width: ${maxWidth};
      margin: 0 auto 16px auto;
      padding: 12px 16px;
      background: #252923;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .toolbar button {
      background: #315744;
      color: #FFFFFF;
      border: 1px solid #315744;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .sheet {
      max-width: ${maxWidth};
      margin: 0 auto;
      background: #FFFFFF;
      border: 1px solid #E7E4DC;
      padding: ${paperFormat === 'thermal80' ? '14px' : '36px'};
    }
    .header {
      display: flex;
      flex-direction: ${paperFormat === 'thermal80' ? 'column' : 'row'};
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 20px;
      border-bottom: 2px solid #252923;
    }
    .brand-title {
      font-size: ${paperFormat === 'thermal80' ? '16px' : '22px'};
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #252923;
    }
    .copy-badge {
      display: inline-block;
      padding: 3px 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.06em;
      background: #F7F6F2;
      border: 1px solid #E7E4DC;
      color: #315744;
      margin-bottom: 6px;
    }
    .invoice-num {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: ${paperFormat === 'thermal80' ? '16px' : '20px'};
      font-weight: 700;
      color: #252923;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: ${paperFormat === 'thermal80' ? '1fr' : '1fr 1fr'};
      gap: 20px;
      padding: 18px 0;
      border-bottom: 1px solid #E7E4DC;
    }
    .kicker {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #777A73;
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 18px 0;
    }
    th {
      border-bottom: 1.5px solid #252923;
      padding: 8px 6px;
      text-align: left;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
      color: #777A73;
      text-transform: uppercase;
    }
    td {
      border-bottom: 1px solid #E7E4DC;
      padding: 10px 6px;
      vertical-align: top;
    }
    .right { text-align: right; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-variant-numeric: tabular-nums; }
    .muted { color: #777A73; }
    .small { font-size: 10px; }
    .fw-600 { font-weight: 600; }
    .words-banner {
      background: #F7F6F2;
      border: 1px solid #E7E4DC;
      padding: 10px 14px;
      margin: 12px 0 18px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: ${paperFormat === 'thermal80' ? '1fr' : '1.2fr 1fr'};
      gap: 24px;
      padding-top: 14px;
      border-top: 1.5px solid #252923;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
    }
    .summary-total {
      display: flex;
      justify-content: space-between;
      padding: 10px 0 6px 0;
      margin-top: 6px;
      border-top: 1.5px solid #252923;
      font-size: 15px;
      font-weight: 700;
      color: #315744;
    }
    .sig-box {
      margin-top: 28px;
      padding-top: 24px;
      border-top: 1px dashed #E7E4DC;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
    }
    @media print {
      body {
        background: #FFFFFF !important;
        padding: 0 !important;
      }
      .toolbar {
        display: none !important;
      }
      .sheet {
        border: none !important;
        padding: 0 !important;
        max-width: 100% !important;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <strong>${escapeHtml(settings.businessName)}</strong> · Tax Invoice ${escapeHtml(invoice.invoiceNumber)} (${escapeHtml(copyType)})
    </div>
    <button onclick="window.print()">Print Invoice</button>
  </div>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand-title">${escapeHtml(settings.businessName)}</div>
        <div class="muted">${escapeHtml(settings.legalName)}</div>
        <div class="muted">${escapeHtml(settings.warehouseAddress)}</div>
        <div class="mono muted" style="margin-top:4px;">
          GSTIN: <strong>${escapeHtml(settings.taxRegistrationNumber)}</strong> · Tel: ${escapeHtml(settings.contactPhone)} · ${escapeHtml(settings.contactEmail)}
        </div>
      </div>
      <div style="text-align:${paperFormat === 'thermal80' ? 'left' : 'right'};">
        <div class="copy-badge">${escapeHtml(copyType)}</div>
        <div class="kicker">TAX INVOICE &amp; DISPATCH NOTE</div>
        <div class="invoice-num">${escapeHtml(invoice.invoiceNumber)}</div>
        <div class="mono muted">Issue Date: ${escapeHtml(issueDate)}</div>
        <div class="mono" style="margin-top:4px;color:${invoice.paymentStatus === 'Paid' ? '#315744' : '#BD704F'};font-weight:600;">
          Status: ${escapeHtml(invoice.paymentStatus.toUpperCase())} (${escapeHtml(invoice.paymentMethod)})
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div>
        <div class="kicker">BILLED TO CONTRACTOR / TRADE ACCOUNT</div>
        <div class="fw-600" style="font-size:14px;">${escapeHtml(invoice.customerCompany)}</div>
        <div>Attn: ${escapeHtml(invoice.customerName)}</div>
        ${
          customer
            ? `<div class="muted">${escapeHtml(customer.address ? customer.address + ', ' : '')}${escapeHtml(customer.city)} · ${escapeHtml(customer.phone)}</div>
               <div class="mono muted">Customer GSTIN: ${escapeHtml(customer.gstOrTaxId || 'Unregistered / Walk-in')}</div>`
            : `<div class="mono muted">Direct Trade Counter Account</div>`
        }
      </div>
      <div style="text-align:${paperFormat === 'thermal80' ? 'left' : 'right'};">
        <div class="kicker">DISPATCH &amp; SETTLEMENT DETAILS</div>
        <div>Payment Mode: <strong>${escapeHtml(invoice.paymentMethod)}</strong></div>
        <div class="muted">Dispatch Bay: Main Yard Gate · Verified Weighbridge</div>
        <div class="muted">Notes: ${escapeHtml(invoice.notes || 'Standard yard dispatch')}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Material Description</th>
          <th>SKU / Code</th>
          <th>Unit</th>
          <th class="right">Qty</th>
          <th class="right">Unit Rate</th>
          <th class="right">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="words-banner">
      <div>
        <span class="kicker" style="margin-right:8px;">AMOUNT IN WORDS:</span>
        <strong>${escapeHtml(amountInWords)}</strong>
      </div>
      <div class="mono muted">Total Qty: ${escapeHtml(invoice.totalQuantity)} units</div>
    </div>

    <div class="footer-grid">
      <div>
        <div class="kicker">BANK &amp; TRADE SETTLEMENT TERMS</div>
        <div class="fw-600">${escapeHtml(settings.legalName)}</div>
        <div class="mono muted">NEFT / RTGS / UPI Account · GSTIN: ${escapeHtml(settings.taxRegistrationNumber)}</div>
        <p class="muted" style="margin:6px 0 0 0;font-size:11px;">
          All structural materials conform to stated IS / EN / BS architectural grade specifications.
          Goods once dispatched from ${escapeHtml(settings.warehouseAddress)} are subject to standard yard inspection terms.
        </p>
      </div>
      <div>
        <div class="summary-row">
          <span class="muted">Taxable Subtotal</span>
          <span class="mono">${escapeHtml(formatCurrency(invoice.subtotal, sym))}</span>
        </div>
        <div class="summary-row">
          <span class="muted">Trade Discount</span>
          <span class="mono" style="color:#BD704F;">-${escapeHtml(formatCurrency(invoice.discountAmount, sym))}</span>
        </div>
        ${taxRowsHtml}
        <div class="summary-total">
          <span>Invoice Grand Total</span>
          <span class="mono">${escapeHtml(formatCurrency(invoice.grandTotal, sym))}</span>
        </div>
        <div class="summary-row">
          <span class="muted">Amount Settled</span>
          <span class="mono">${escapeHtml(formatCurrency(amountPaid, sym))}</span>
        </div>
        <div class="summary-row" style="font-weight:600;color:${balanceDue > 0 ? '#BD704F' : '#315744'};">
          <span>Balance Due</span>
          <span class="mono">${escapeHtml(formatCurrency(balanceDue, sym))}</span>
        </div>
      </div>
    </div>

    <div class="sig-box">
      <div class="muted small">
        Receiver's Signature &amp; Site Stamp<br />
        Received materials in good structural condition.
      </div>
      <div style="text-align:right;">
        <div class="fw-600">For ${escapeHtml(settings.businessName)}</div>
        <div class="muted small" style="margin-top:22px;">Authorized Yard Signatory</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates a standalone print-ready HTML document for a Supplier Purchase Order (PO).
 */
export function buildPrintablePurchaseOrderHtml(
  po: PurchaseOrder,
  settings: BusinessSettings,
  supplier?: Supplier | null,
  items: PurchaseItem[] = []
): string {
  const sym = settings.currencySymbol || '₹';
  const issueDate = (po.createdAt || po.date || new Date().toISOString()).slice(0, 10);
  const amountInWords = numberToIndianWords(po.totalAmount, sym);

  const effectiveItems: PurchaseItem[] =
    items.length > 0
      ? items
      : [
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

  const rowsHtml = effectiveItems
    .map(
      (item, idx) => `
      <tr>
        <td class="mono muted">${String(idx + 1).padStart(2, '0')}</td>
        <td class="fw-600">${escapeHtml(item.productName)}</td>
        <td class="mono">${escapeHtml(item.sku)}</td>
        <td class="right mono fw-600">+${escapeHtml(item.quantity)} ${escapeHtml(item.unit || '')}</td>
        <td class="right mono">${escapeHtml(formatCurrency(item.unitPrice, sym))}</td>
        <td class="right mono fw-600">${escapeHtml(formatCurrency(item.lineTotal, sym))}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Purchase Order ${escapeHtml(po.poNumber)} — ${escapeHtml(settings.businessName)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 24px; background: #F7F6F2; color: #252923; font-family: 'Public Sans', -apple-system, sans-serif; font-size: 12px; line-height: 1.5; }
    .sheet { max-width: 840px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E7E4DC; padding: 36px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 2px solid #252923; }
    .brand-title { font-size: 22px; font-weight: 700; color: #252923; }
    .po-num { font-family: monospace; font-size: 20px; font-weight: 700; color: #315744; }
    .kicker { font-family: monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #777A73; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 18px 0; border-bottom: 1px solid #E7E4DC; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; }
    th { border-bottom: 1.5px solid #252923; padding: 8px 6px; text-align: left; font-family: monospace; font-size: 10px; color: #777A73; text-transform: uppercase; }
    td { border-bottom: 1px solid #E7E4DC; padding: 10px 6px; }
    .right { text-align: right; }
    .mono { font-family: monospace; font-variant-numeric: tabular-nums; }
    .muted { color: #777A73; }
    .fw-600 { font-weight: 600; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .summary-total { display: flex; justify-content: space-between; padding: 10px 0; border-top: 1.5px solid #252923; font-size: 15px; font-weight: 700; color: #315744; }
    @media print { body { background: #FFFFFF !important; padding: 0 !important; } .sheet { border: none !important; padding: 0 !important; max-width: 100% !important; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand-title">${escapeHtml(settings.businessName)}</div>
        <div class="muted">${escapeHtml(settings.legalName)}</div>
        <div class="muted">${escapeHtml(settings.warehouseAddress)}</div>
        <div class="mono muted">GSTIN: ${escapeHtml(settings.taxRegistrationNumber)}</div>
      </div>
      <div style="text-align:right;">
        <div class="kicker">PURCHASE ORDER &amp; INWARD GRN</div>
        <div class="po-num">${escapeHtml(po.poNumber)}</div>
        <div class="mono muted">Date: ${escapeHtml(issueDate)}</div>
        <div class="mono">Payment: ${escapeHtml(po.paymentStatus)}</div>
      </div>
    </div>
    <div class="grid-2">
      <div>
        <div class="kicker">SUPPLIER / MILL</div>
        <div class="fw-600" style="font-size:14px;">${escapeHtml(po.supplierName)}</div>
        ${
          supplier
            ? `<div class="muted">Attn: ${escapeHtml(supplier.contactPerson)} · ${escapeHtml(supplier.phone)}</div>
               <div class="mono muted">GSTIN: ${escapeHtml(supplier.gstin || 'N/A')} · ${escapeHtml(supplier.city)}</div>`
            : ''
        }
      </div>
      <div style="text-align:right;">
        <div class="kicker">RECEIVING YARD</div>
        <div>${escapeHtml(settings.warehouseAddress)}</div>
        <div class="muted">Notes: ${escapeHtml(po.notes || 'Inward stock entry verified')}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Material</th>
          <th>SKU</th>
          <th class="right">Qty Received</th>
          <th class="right">Unit Cost</th>
          <th class="right">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    <div style="display:flex;justify-content:space-between;gap:24px;padding-top:12px;border-top:1.5px solid #252923;">
      <div>
        <div class="kicker">AMOUNT IN WORDS</div>
        <div class="fw-600">${escapeHtml(amountInWords)}</div>
      </div>
      <div style="min-width:260px;">
        <div class="summary-row"><span class="muted">Net Subtotal</span><span class="mono">${escapeHtml(formatCurrency(Number(po.subtotal ?? po.totalCost ?? 0), sym))}</span></div>
        <div class="summary-row"><span class="muted">Input GST (${po.taxRate ?? 18}%)</span><span class="mono">${escapeHtml(formatCurrency(Number(po.taxAmount ?? 0), sym))}</span></div>
        <div class="summary-total"><span>Total PO Value</span><span class="mono">${escapeHtml(formatCurrency(Number(po.totalAmount ?? po.totalCost ?? 0), sym))}</span></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Triggers printing of a standalone HTML document using an injected hidden iframe,
 * with automatic fallback to window.print(). Works cleanly without window.open().
 */
export function triggerDocumentPrint(htmlDocument: string): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }

  try {
    const existing = document.getElementById('buildflow-print-frame');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'buildflow-print-frame';
    iframe.title = 'Printable Tax Document';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (frameDoc && iframe.contentWindow) {
      frameDoc.open();
      frameDoc.write(htmlDocument);
      frameDoc.close();

      const triggerFramePrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          try {
            window.print();
          } catch {
            // Ignored if sandboxed
          }
        }
      };

      setTimeout(triggerFramePrint, 180);
      return true;
    }
  } catch {
    // Fallback to window.print
  }

  try {
    window.print();
    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads a standalone print-ready HTML document to the user's device.
 */
export function downloadPrintableHtml(
  htmlDocument: string,
  filename: string
): void {
  if (typeof document === 'undefined') return;
  const safeName = filename.endsWith('.html') ? filename : `${filename}.html`;
  const blob = new Blob([htmlDocument], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', safeName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
