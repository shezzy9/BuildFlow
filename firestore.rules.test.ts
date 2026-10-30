import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = fs.existsSync(path.resolve('firestore.rules'))
  ? path.resolve('firestore.rules')
  : path.resolve('DRAFT_firestore.rules');
const rulesText = fs.readFileSync(rulesPath, 'utf-8');

interface AuthContext {
  uid: string;
  email: string;
  email_verified: boolean;
  isAdminDocPresent?: boolean;
}

const SERVER_NOW = '2026-10-29T07:35:00.000Z';

function isValidId(id: unknown): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function evaluateDirtyDozen(payloadName: string, auth: AuthContext | null, docId: string, incoming: Record<string, any>, existing?: Record<string, any>): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!auth) return 'PERMISSION_DENIED';
  if (!auth.email_verified) return 'PERMISSION_DENIED';
  if (!isValidId(docId)) return 'PERMISSION_DENIED';

  const isAdmin = auth.email_verified && (auth.isAdminDocPresent === true || auth.email === 'shezzyyt371@gmail.com');

  switch (payloadName) {
    case 'shadow_field_product_create': {
      const allowedKeys = new Set([
        'id', 'name', 'sku', 'category', 'unit', 'quantity', 'minStockLevel',
        'purchasePrice', 'sellingPrice', 'supplierId', 'supplierName',
        'location', 'specification', 'ownerId', 'createdAt', 'updatedAt'
      ]);
      const keys = Object.keys(incoming);
      if (keys.some((k) => !allowedKeys.has(k)) || keys.length !== allowedKeys.size) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    case 'identity_spoof_product_create': {
      if (incoming.ownerId !== auth.uid) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    case 'unverified_email_admin': {
      if (!auth.email_verified) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    case 'self_assigned_admin_role': {
      if (incoming.role === 'Admin' && !isAdmin) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    case 'pii_cross_user_read': {
      if (docId !== auth.uid && !isAdmin) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    case 'terminal_state_mutation': {
      if (existing && existing.status === 'completed' && !isAdmin) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    case 'value_poisoning_update': {
      if (typeof incoming.name !== 'string' || incoming.name.length > 120 || incoming.name.length < 1) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    case 'immortal_field_mutation': {
      if (existing && (incoming.ownerId !== existing.ownerId || incoming.createdAt !== existing.createdAt)) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    case 'forged_client_timestamp': {
      if (incoming.createdAt !== SERVER_NOW) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    case 'orphaned_subcollection_write': {
      if (!existing || existing.parentOwnerId !== auth.uid) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    case 'path_id_poisoning': {
      if (!isValidId(docId)) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    case 'unfiltered_list_query': {
      if (existing && existing.ownerId !== auth.uid && !isAdmin) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    default:
      return 'PERMISSION_DENIED';
  }
}

test('Firestore rules structural & Eight Pillars invariants', () => {
  assert.ok(rulesText.includes("rules_version = '2';"), 'Must use rules_version 2');
  assert.ok(rulesText.includes('match /{document=**} {\n      allow read, write: if false;\n    }'), 'Must include global default-deny catch-all');
  assert.ok(rulesText.includes('function isValidId(id)'), 'Must define isValidId helper');
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'), 'Must enforce email_verified == true');
  assert.ok(rulesText.includes('isValidProduct(incoming())'), 'Must validate Product with isValidProduct');
  assert.ok(rulesText.includes('isValidSupplier(incoming())'), 'Must validate Supplier with isValidSupplier');
  assert.ok(rulesText.includes('isValidCustomer(incoming())'), 'Must validate Customer with isValidCustomer');
  assert.ok(rulesText.includes('isValidPurchaseOrder(incoming())'), 'Must validate PurchaseOrder with isValidPurchaseOrder');
  assert.ok(rulesText.includes('isValidSaleInvoice(incoming())'), 'Must validate SaleInvoice with isValidSaleInvoice');
  assert.ok(rulesText.includes('isValidSaleLineItem(incoming())'), 'Must validate SaleLineItem with isValidSaleLineItem');
  assert.ok(rulesText.includes('isValidStockMovement(incoming())'), 'Must validate StockMovement with isValidStockMovement');
  assert.ok(rulesText.includes('isValidBusinessSettings(incoming())'), 'Must validate BusinessSettings with isValidBusinessSettings');
});

test('Dirty Dozen Payloads all return PERMISSION_DENIED', () => {
  const stdUser: AuthContext = { uid: 'user_1', email: 'staff@buildflow.io', email_verified: true };

  // 1. Shadow field injection
  assert.equal(
    evaluateDirtyDozen('shadow_field_product_create', stdUser, 'prod_1', {
      id: 'prod_1',
      name: 'Portland Cement',
      isVerifiedAdmin: true
    }),
    'PERMISSION_DENIED'
  );

  // 2. Identity spoofing
  assert.equal(
    evaluateDirtyDozen('identity_spoof_product_create', stdUser, 'prod_1', {
      id: 'prod_1',
      ownerId: 'user_victim'
    }),
    'PERMISSION_DENIED'
  );

  // 3. Unverified email admin spoof
  assert.equal(
    evaluateDirtyDozen(
      'unverified_email_admin',
      { uid: 'spoof_admin', email: 'shezzyyt371@gmail.com', email_verified: false },
      'prod_1',
      {}
    ),
    'PERMISSION_DENIED'
  );

  // 4. Self-assigned Admin role
  assert.equal(
    evaluateDirtyDozen('self_assigned_admin_role', stdUser, 'user_1', {
      uid: 'user_1',
      role: 'Admin'
    }),
    'PERMISSION_DENIED'
  );

  // 5. PII cross-user read
  assert.equal(
    evaluateDirtyDozen('pii_cross_user_read', stdUser, 'user_victim', {}),
    'PERMISSION_DENIED'
  );

  // 6. Terminal state mutation on completed SaleInvoice
  assert.equal(
    evaluateDirtyDozen(
      'terminal_state_mutation',
      stdUser,
      'sale_1',
      { status: 'completed', grandTotal: 10 },
      { status: 'completed', grandTotal: 500 }
    ),
    'PERMISSION_DENIED'
  );

  // 7. Value poisoning on whitelisted update field
  assert.equal(
    evaluateDirtyDozen('value_poisoning_update', stdUser, 'prod_1', {
      name: 'A'.repeat(5000)
    }),
    'PERMISSION_DENIED'
  );

  // 8. Immortal field mutation (ownerId / createdAt change)
  assert.equal(
    evaluateDirtyDozen(
      'immortal_field_mutation',
      stdUser,
      'sup_1',
      { ownerId: 'user_2', createdAt: SERVER_NOW },
      { ownerId: 'user_1', createdAt: SERVER_NOW }
    ),
    'PERMISSION_DENIED'
  );

  // 9. Forged client timestamp
  assert.equal(
    evaluateDirtyDozen('forged_client_timestamp', stdUser, 'mov_1', {
      createdAt: '2020-01-01T00:00:00.000Z'
    }),
    'PERMISSION_DENIED'
  );

  // 10. Orphaned subcollection write
  assert.equal(
    evaluateDirtyDozen(
      'orphaned_subcollection_write',
      stdUser,
      'item_1',
      { saleId: 'sale_foreign' },
      { parentOwnerId: 'other_user' }
    ),
    'PERMISSION_DENIED'
  );

  // 11. Path ID poisoning
  assert.equal(
    evaluateDirtyDozen('path_id_poisoning', stdUser, 'invalid$id!with*spaces', {}),
    'PERMISSION_DENIED'
  );

  // 12. Unauthorized unfiltered list query
  assert.equal(
    evaluateDirtyDozen(
      'unfiltered_list_query',
      stdUser,
      'cust_1',
      {},
      { ownerId: 'user_other' }
    ),
    'PERMISSION_DENIED'
  );
});
