# API Reference Specification — Cambusa

All endpoints are hosted under the global prefix `/api` (with the exception of `/health`).
Unless marked public, endpoints require session cookies (`cambusa_at` / `cambusa_it`) and an active household identifier passed via the `X-Household-Id` header.

---

## 1. Global Conventions

### 1.1 Tenant Context Header
Most domain endpoints require the tenant identifier:
```http
X-Household-Id: <uuid>
```
If omitted or the user is not an active member of the specified household, the API responds with `403 Forbidden`.

### 1.2 Error Response Format
All errors follow standard RFC 7807 JSON schemas:
```json
{
  "statusCode": 400,
  "message": "Product name is required",
  "error": "Bad Request"
}
```

---

## 2. Health & Status

### `GET /health`
- **Auth**: None (Public)
- **Response**: `200 OK`
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 1248.5,
  "timestamp": "2026-11-23T10:45:00.000Z"
}
```

---

## 3. Authentication & Profile (`/api/auth`)

### `GET /api/auth/login`
- **Auth**: None (Public)
- **Description**: Generates PKCE challenge and redirects to OIDC provider login.

### `GET /api/auth/oidc/callback`
- **Auth**: None (Public)
- **Description**: Exchanges OIDC authorization code for tokens, sets HttpOnly cookies, and redirects to frontend.

### `GET /api/auth/me`
- **Auth**: Required (`BearerJwtGuard`)
- **Description**: Returns current authenticated user (including display name, email, and OIDC profile picture URL), household memberships, and pending invitations.
- **Response**:
  ```json
  {
    "user": {
      "id": "e9324d27-4648-4394-bb9e-315147be15e3",
      "email": "user@example.com",
      "displayName": "John Doe",
      "pictureUrl": "https://avatar.example.com/photo.webp"
    },
    "households": [
      {
        "id": "787c800c-bce0-4284-82f5-b3e10884df00",
        "name": "Main Home",
        "role": "owner",
        "isOwner": true,
        "memberCount": 2
      }
    ],
    "activeHouseholdId": "787c800c-bce0-4284-82f5-b3e10884df00",
    "pendingInvitationsCount": 0
  }
  ```

### `POST /api/auth/logout`
- **Auth**: Required
- **Description**: Clears session cookies and invalidates session.

### `POST /api/auth/refresh`
- **Auth**: Required (refresh token cookie `cambusa_rt`)
- **Description**: Refreshes user access token in the background, rotating session cookies silently.

---

## 4. Household Management (`/api/households`)

### `GET /api/households`
- **Description**: Lists all households the authenticated user belongs to.

### `POST /api/households`
- **Body**: `{ "name": "New Home" }`
- **Description**: Creates a new household. The creating user is automatically designated as `owner`.

### `PUT /api/households/:id`
- **Body**: `{ "name": "Updated Name" }`
- **Description**: Renames the specified household. **Strict Permission**: Only the household owner can rename the household. Requests by non-owners return `403 Forbidden`.

### `DELETE /api/households/:id`
- **Description**: Permanently deletes the household, memberships, invitations, and cascaded data. **Strict Permission**: Only the household owner can delete the household. Requests by non-owners return `403 Forbidden`.

### `GET /api/households/:id/members`
- **Description**: Lists members belonging to the household.

### `POST /api/households/:id/invitations`
- **Body**: `{ "email": "roommate@example.com", "role": "member" }`
- **Description**: Sends an invitation to join the household. (Owner only).

### `DELETE /api/households/:id/invitations/:inviteId`
- **Description**: Revokes a pending invitation. (Owner only).

### `GET /api/households/invitations/pending`
- **Description**: Lists pending invitations directed to the current authenticated user's email address.

### `POST /api/households/invitations/:inviteId/accept`
- **Description**: Accepts an invitation and adds the user to the household.

### `POST /api/households/invitations/:inviteId/decline`
- **Description**: Declines and removes an invitation.

---

## 5. Catalogs (`/api/catalogs`)

- `GET /api/catalogs/units`: List quantity units for household.
- `POST /api/catalogs/units`: Create quantity unit.
- `GET /api/catalogs/groups`: List categories / product groups.
- `POST /api/catalogs/groups`: Create product group.
- `GET /api/catalogs/locations`: List storage locations (e.g. Fridge, Pantry, Freezer with `isFreezer` flag).
- `POST /api/catalogs/locations`: Create storage location.
- `GET /api/catalogs/stores`: List stores / supermarkets.
- `POST /api/catalogs/stores`: Create store.

---

## 6. Products (`/api/products`)

### `GET /api/products`
- **Query Params**:
  - `groupId` (optional): Filter by category.
  - `search` (optional): Search query matching product name or barcode.
  - `includeRollup` (optional, default `true`): Calculates aggregated stock including all recursive descendants.
  - `includeInactive` (optional, default `false`): Includes deactivated products (used when resolving historical or inactive items in pantry stock).
- **Description**: Returns products along with breadcrumb paths, direct stock, and rollup stock.

### `GET /api/products/:id`
- **Description**: Retrieves single product details including ancestors array, store associations, and inventory.

### `POST /api/products`
- **Body**:
```json
{
  "name": "Organic Extra Virgin Olive Oil 1L",
  "description": "<p>Cold-pressed Tuscan olive oil.</p>",
  "barcodes": ["8001234567890", "8009876543210"],
  "cannotBeFrozen": true,
  "openLocationId": "loc-uuid-pantry",
  "moveOnOpen": true,
  "defaultStoreId": "store-uuid-coop",
  "dueType": "best_before",
  "defaultBestBeforeDays": 365,
  "defaultBestBeforeDaysAfterOpen": 60,
  "defaultBestBeforeDaysAfterFreezing": null,
  "defaultBestBeforeDaysAfterThawing": null,
  "minStockAmount": 2,
  "treatOpenedAsOutOfStock": true,
  "productGroupId": "group-uuid",
  "defaultLocationId": "loc-uuid-cellar",
  "quStockId": "qu-uuid",
  "parentProductId": "parent-product-uuid"
}
```

### `PUT /api/products/:id`
- **Description**: Updates product metadata. Rejects cyclic parent relationships.

### `DELETE /api/products/:id`
- **Description**: Deletes product, associated picture files, and writes record to `sync_tombstones`.

### `POST /api/products/:id/picture`
- **Body**: `multipart/form-data` with `file`.
- **Description**: Uploads a photo, optimizes and transcodes to WebP (`1200x1200px` max, quality 85) in `uploads/products/<uuid>.webp`, and appends filename to `pictureFileNames`.

### `DELETE /api/products/:id/picture/:fileName`
- **Description**: Removes specific image file from disk and deletes reference from product's `pictureFileNames` array.

### `PUT /api/products/:id/pictures/order`
- **Body**: `{ "pictureFileNames": ["uuid1.webp", "uuid2.webp"] }`
- **Description**: Updates the ordering of product pictures. The first photo is considered primary across the UI.

---

## 7. Pantry Stock (`/api/stock`)

### `GET /api/stock`
- **Query Params**:
  - `locationId` (optional): Filter by location.
  - `dueSoonDays` (optional): Filter items expiring within `N` days.
  - `sort`: Default is `bestBeforeDate ASC`.
- **Description**: Returns all pantry inventory items with computed `urgency` flags (`expired`, `due_soon`, `approaching`, `good`, `none`), `productPictureFileNames`, and `daysUntilExpiration`.

### `POST /api/stock`
- **Body**:
```json
{
  "productId": "product-uuid",
  "amount": 2,
  "bestBeforeDate": "2026-12-05",
  "locationId": "loc-uuid",
  "price": 1.59,
  "note": "On sale"
}
```

### `PUT /api/stock/:id`
- **Description**: Updates attributes of a specific stock inventory batch (quantity, expiration date, storage location, purchase price, notes, and opened state).
- **Body**:
```json
{
  "amount": 2,
  "bestBeforeDate": "2027-01-15",
  "locationId": "location-uuid",
  "price": 3.49,
  "note": "Bulk discount purchase",
  "isOpen": false,
  "openedDate": null
}
```

### `POST /api/stock/:id/consume`
- **Body**: `{ "amount": 1, "isSpoiled": false }`
- **Description**: Consumes specified amount from stock item. If `isSpoiled: true`, records spoiled inventory event. Automatically deletes the item if quantity drops to 0.

### `POST /api/stock/:id/toggle-open`
- **Description**: Toggles opened state. Recalculates `bestBeforeDate` using product's `defaultBestBeforeDaysAfterOpen` policy and automatically moves to `openLocationId` if `moveOnOpen` is enabled.

### `POST /api/stock/transfer`
- **Body**:
```json
{
  "stockItemId": "stock-uuid",
  "locationId": "destination-location-uuid"
}
```
- **Description**: Relocates stock item to target location.
  - **Constraint Validation**: If target location has `isFreezer: true` and the product has `cannotBeFrozen: true`, the transfer is rejected with `400 Bad Request` ("This product cannot be stored in a freezer location").
  - **Date Recalculation**: If moved to a freezer location, expiration date is recalculated using `defaultBestBeforeDaysAfterFreezing`. If moved out of a freezer location to a non-freezer location, expiration date is recalculated using `defaultBestBeforeDaysAfterThawing`.

### `DELETE /api/stock/:id`
- **Description**: Deletes item and writes to `sync_tombstones`.

---

## 8. Shopping Lists (`/api/shopping-list`)

### `GET /api/shopping-list/lists`
- **Description**: Lists all shopping lists belonging to the household.

### `POST /api/shopping-list/lists`
- **Body**: `{ "name": "Weekly Groceries", "storeId": "store-uuid" }`
- **Description**: Creates a new shopping list with optional store association.

### `PUT /api/shopping-list/lists/:id`
- **Body**: `{ "name": "Updated Name", "storeId": "store-uuid" }`
- **Description**: Updates list name and associated store.

### `DELETE /api/shopping-list/lists/:id`
- **Description**: Deletes shopping list and all items contained within it.

### `GET /api/shopping-list/items`
- **Query Params**:
  - `shoppingListId` (optional): Filter by target shopping list.
  - `storeId` (optional): Sorts and groups items according to the store's aisle order (`aisleOrder ASC, aisle ASC`).
- **Description**: Returns shopping items with linked product stock information, photo thumbnails, earliest expiration dates, store pricing, and aisle details.

### `POST /api/shopping-list/items`
- **Body**:
```json
{
  "shoppingListId": "list-uuid",
  "productId": "product-uuid",
  "customName": null,
  "amount": 2,
  "storeId": "store-uuid",
  "note": "Prefer organic"
}
```
- **Description**: Adds catalog product or uncataloged custom item (`customName`) to shopping list.

### `PUT /api/shopping-list/items/:id`
- **Body**:
```json
{
  "amount": 3,
  "storeId": "store-uuid",
  "note": "Updated preference"
}
```
- **Description**: Updates an existing shopping list item in-place.

### `PUT /api/shopping-list/items/:id/done`
- **Body**: `{ "done": true }`
- **Description**: Toggles item strikethrough state in the shopping list. **CRITICAL INVARIANT**: This action NEVER mutates pantry inventory or creates stock records.

### `GET /api/shopping-list/missing-products`
- **Description**: Returns all products where current pantry stock is below `minStockAmount` (respecting `treatOpenedAsOutOfStock`).

### `POST /api/shopping-list/auto-add-missing`
- **Body**: `{ "shoppingListId": "list-uuid", "productIds": ["prod-1", "prod-2"] }`
- **Description**: Appends missing products to the specified shopping list.

### `DELETE /api/shopping-list/items/done`
- **Query Params**: `shoppingListId` (optional).
- **Description**: Clears completed items from the shopping list.

---

## 9. Saved Filters (`/api/saved-filters`)

- `GET /api/saved-filters`: Retrieves saved 1-click pantry filter presets.
- `POST /api/saved-filters`: Creates a named filter preset.
- `DELETE /api/saved-filters/:id`: Deletes a filter preset.

---

## 11. User Profile & Integrations (`/api/profile`)

### `GET /api/profile`
- **Auth**: Required (`BearerJwtGuard`)
- **Description**: Retrieves current user account details, Next horizon settings, Mealie integration status, and active API keys list (with keys masked as prefixes).

### `POST /api/profile/api-keys`
- **Auth**: Required (`BearerJwtGuard`)
- **Body**: `{ "name": "Home Assistant Wall Panel" }`
- **Response**: `201 Created`
```json
{
  "id": "key-uuid",
  "name": "Home Assistant Wall Panel",
  "keyPrefix": "cambusa_ak_49f8...",
  "rawKey": "cambusa_ak_49f8d16782...",
  "createdAt": "2026-11-23T12:00:00.000Z"
}
```
- **Description**: Generates a new 256-bit cryptographically secure API key. The `rawKey` is revealed **only once** in this response; subsequent fetches expose only `keyPrefix`.

### `DELETE /api/profile/api-keys/:id`
- **Auth**: Required (`BearerJwtGuard`)
- **Description**: Permanently revokes the specified API key. Revocation is immediate.

### `PUT /api/profile/settings`
- **Auth**: Required (`BearerJwtGuard`)
- **Body**:
```json
{
  "nextExpiringDays": 7,
  "mealieUrl": "https://mealie.home.arpa",
  "mealieApiToken": "mealie-token-here",
  "notificationEmail": "user@example.com",
  "emailNotificationsEnabled": true,
  "notificationTime": "06:00"
}
```
- **Description**: Updates user personal preferences, Next engine scan horizon (1-365 days), Mealie instance credentials, and daily morning email digest preferences (recipient email, enable/disable toggle, and 24-hour dispatch time).

### `POST /api/profile/notifications/test`
- **Auth**: Required (`BearerJwtGuard`)
- **Body**: `{}`
- **Response**: `200 OK`
```json
{
  "ok": true,
  "message": "Test notification email sent to user@example.com"
}
```
- **Description**: Triggers an immediate test dispatch of the daily morning digest email with graphical summary cards and embedded CID product photos to verify SMTP configuration and inbox delivery.

### `POST /api/profile/mealie/test`
- **Auth**: Required (`BearerJwtGuard`)
- **Body**:
```json
{
  "url": "https://mealie.home.arpa",
  "token": "mealie-token-here"
}
```
- **Response**:
```json
{
  "ok": true,
  "version": "v1.4.0",
  "recipeCount": 85
}
```
- **Description**: Tests connectivity, token validity, and recipe count against the configured Mealie instance.

---

## 12. Next Engine Feed (`/api/next`)

### `GET /api/next`
- **Auth**: Required (Session cookies OR `X-API-Key: cambusa_ak_...` OR `Authorization: Bearer cambusa_ak_...`)
- **Query Parameters**:
  - `householdId` (optional): Target household UUID. Defaults to user's active/default household.
  - `days` (optional): Scan horizon in days. Defaults to user's configured `nextExpiringDays` (or 5).
- **Response**: `200 OK`
```json
{
  "summary": {
    "expiredCount": 2,
    "expiringSoonCount": 4,
    "totalUniqueProductsInStock": 28,
    "totalStockItems": 64.5,
    "configuredDays": 7
  },
  "expired": [
    {
      "id": "stock-uuid-1",
      "productId": "prod-uuid-1",
      "productName": "Whole Milk",
      "amount": 1,
      "quantityUnit": "Bottle",
      "location": "Kitchen Refrigerator",
      "bestBeforeDate": "2026-11-20",
      "isOpened": true,
      "daysOverdue": 3
    }
  ],
  "expiringSoon": [
    {
      "id": "stock-uuid-2",
      "productId": "prod-uuid-2",
      "productName": "Greek Yogurt",
      "amount": 2,
      "quantityUnit": "Cup",
      "location": "Kitchen Refrigerator",
      "bestBeforeDate": "2026-11-25",
      "isOpened": false,
      "daysRemaining": 2
    }
  ],
  "household": {
    "id": "household-uuid",
    "name": "Main Home"
  },
  "generatedAt": "2026-11-23T18:00:00.000Z"
}
```
- **Description**: High-performance dashboard and external integration endpoint. Returns pantry summary analytics (with distinct products counted once), products already past their expiration date, and products expiring within the configured scan horizon. Accessible by external automations (Home Assistant, e-ink displays, cron webhooks) using API keys.

---

## 13. Offline Synchronization (`/api/sync`)

### `POST /api/sync`
- **Body**:
```json
{
  "lastSyncAt": "2026-11-23T10:00:00.000Z",
  "changes": {
    "products": [],
    "stock": [],
    "shoppingListItems": []
  }
}
```
- **Response**:
```json
{
  "syncedAt": "2026-11-23T10:45:00.000Z",
  "serverChanges": {
    "products": [],
    "stock": [],
    "shoppingListItems": []
  },
  "tombstones": [
    {
      "entityType": "stock",
      "entityId": "item-uuid",
      "deletedAt": "2026-11-23T10:30:00.000Z"
    }
  ]
}
```
