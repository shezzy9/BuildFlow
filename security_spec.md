# BuildFlow Supply — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Default-Deny Catch-All**: All paths not explicitly matched in `firestore.rules` are unconditionally denied (`allow read, write: if false;`).
2. **Email Verification & Identity Integrity**: Every write operation requires an authenticated user (`request.auth != null`) with `request.auth.token.email_verified == true`, and any `ownerId` or `uid` field in `request.resource.data` must strictly match `request.auth.uid`.
3. **Path Variable Hardening (`isValidId`)**: Every single-document operation (`get`, `create`, `update`, `delete`) validates path IDs against `^[a-zA-Z0-9_\-]+$` with length `<= 128`.
4. **Strict Schema Blueprints (`hasAll` & `hasOnly`)**: Every entity has a dedicated `isValid[Entity](data)` helper enforcing exact keys (`hasAll` and `hasOnly`), field types, string `.size()` bounds, numeric non-negativity, and enum membership.
5. **Action-Based Updates & Terminal State Locking**:
   - Every `update` block begins with `isSignedIn() && isVerified() && isValidId(...) && isValid[Entity](incoming())`.
   - `PurchaseOrder` and `SaleInvoice` lock updates once `existing().status == 'completed'` (unless `isAdmin()`).
   - `ownerId` and `createdAt` are immutable across all updates (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
   - Timestamps (`createdAt` on create, `updatedAt` on create/update) must strictly equal `request.time`.
6. **Master Gate & Relational Integrity**:
   - Creating a `PurchaseOrder` requires `exists(/databases/$(database)/documents/products/$(incoming().productId))` and `getAfter(/databases/$(database)/documents/products/$(incoming().productId)).data.quantity >= 0`.
   - Creating a `SaleInvoice` requires `exists(/databases/$(database)/documents/products/$(incoming().primaryProductId))`.
   - Subcollection `/sales/{saleId}/items/{itemId}` enforces the Master Gate by fetching parent `/sales/{saleId}` via `get()` and verifying `parent.data.ownerId == request.auth.uid`.
7. **PII Isolation & Query Enforcement**:
   - User PII (`email`, `phone`) is isolated in `/users/{userId}/private/{docId}` and restricted to `isOwner(userId) || isAdmin()`.
   - Every `allow list` rule enforces `resource.data.ownerId == request.auth.uid || isAdmin()` without calling `get()` or `exists()` inside `list`.

---

## 2. The "Dirty Dozen" Payloads (Adversarial Test Vectors)

1. **Payload 1 — Shadow Field Injection on Product Create**:
   ```json
   {
     "id": "prod_1",
     "name": "Portland Cement",
     "sku": "CEM-001",
     "category": "Cement",
     "unit": "Bag (50kg)",
     "quantity": 100,
     "minStockLevel": 20,
     "purchasePrice": 8.5,
     "sellingPrice": 11.0,
     "supplierId": "sup_1",
     "supplierName": "Holcim",
     "location": "Bay A1",
     "specification": "EN 197-1 CEM I 52.5N",
     "ownerId": "user_1",
     "isVerifiedAdmin": true
   }
   ```
   *Expected*: `PERMISSION_DENIED` (blocked by `data.keys().hasOnly(...)`).

2. **Payload 2 — Identity Spoofing (`ownerId` mismatch)**:
   Authenticated as `user_attacker`, attempting to create a `Product` with `"ownerId": "user_victim"`.
   *Expected*: `PERMISSION_DENIED` (blocked by `data.ownerId == request.auth.uid`).

3. **Payload 3 — Unverified Email Admin Spoof**:
   Authenticated with `"email": "shezzyyt371@gmail.com"`, `"email_verified": false`, attempting admin write.
   *Expected*: `PERMISSION_DENIED` (blocked by `request.auth.token.email_verified == true`).

4. **Payload 4 — Self-Assigned Admin Role Escalation on `/users/{userId}`**:
   Non-admin user creating `/users/user_1` with `"role": "Admin"`.
   *Expected*: `PERMISSION_DENIED` (non-admins cannot self-assign `"Admin"` role).

5. **Payload 5 — PII Cross-User Read on `/users/{victimId}/private/info`**:
   Authenticated as `user_attacker`, attempting `get` on `/users/user_victim/private/info`.
   *Expected*: `PERMISSION_DENIED` (restricted to `isOwner(userId) || isAdmin()`).

6. **Payload 6 — Terminal State Mutation on Completed `SaleInvoice`**:
   Attempting `update` on `/sales/sale_1` where `existing().status == 'completed'` to alter `grandTotal`.
   *Expected*: `PERMISSION_DENIED` (terminal state lock `existing().status != 'completed'`).

7. **Payload 7 — Value Poisoning on Whitelisted Update Field**:
   Updating `Product.name` with a 5,000-character string or a boolean `true`.
   *Expected*: `PERMISSION_DENIED` (blocked by `isValidProduct(incoming())` inside `allow update`).

8. **Payload 8 — Immortal Field Mutation (`createdAt` / `ownerId` change on Update)**:
   Updating `Supplier` while changing `ownerId` or `createdAt`.
   *Expected*: `PERMISSION_DENIED` (blocked by `incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).

9. **Payload 9 — Forged Client Timestamp (`createdAt != request.time`)**:
   Creating `StockMovement` with a backdated `createdAt` timestamp instead of `request.time`.
   *Expected*: `PERMISSION_DENIED` (blocked by `data.createdAt == request.time`).

10. **Payload 10 — Orphaned Subcollection Write (`/sales/{saleId}/items/{itemId}`)**:
    Creating a `SaleLineItem` under a non-existent or foreign `saleId`.
    *Expected*: `PERMISSION_DENIED` (blocked by Master Gate `get(/databases/$(database)/documents/sales/$(saleId)).data.ownerId == request.auth.uid`).

11. **Payload 11 — Path ID Poisoning (`{productId}` with invalid characters/length)**:
    Creating `/products/invalid$id!with*spaces` or ID > 128 chars.
    *Expected*: `PERMISSION_DENIED` (blocked by `isValidId(productId)`).

12. **Payload 12 — Unauthorized Unfiltered List Query on `/customers`**:
    Listing `/customers` where `resource.data.ownerId != request.auth.uid`.
    *Expected*: `PERMISSION_DENIED` (blocked by `resource.data.ownerId == request.auth.uid || isAdmin()`).
