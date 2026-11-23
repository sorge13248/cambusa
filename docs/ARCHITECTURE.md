# System Architecture — Cambusa

Cambusa is a self-hostable, private-first home pantry, grocery management, and meal planning system built with an offline-first Progressive Web Application (PWA) architecture and bi-directional synchronization.

---

## 1. High-Level Architectural Overview

Cambusa follows a modern decoupled architecture packaged in a single, lightweight production container:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        User Client Browser / PWA                       │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │            Angular 22 Standalone SPA (Signals + CDK)           │   │
│   │                                                                │   │
│   │  • AppShell (Icon 2 Brand, Drawer Switcher, Sync Indicator)    │   │
│   │  • Home Dashboard (/home, Next Engine KPIs, Attention Feed)    │   │
│   │  • Pantry (Exp-First, Action Modal: Consume/Purchase/Move)     │   │
│   │  • Products (Collapsible Accordion, Infinite Tree, CDK DnD)    │   │
│   │  • Shopping (Multi-List, Store Routes, Catalog Search Dialog)  │   │
│   │  • User Profile & Integrations (/profile, API Keys, Mealie)    │   │
│   │  • CDK Dialog Modals (Actions, Add Item, Confirmations)        │   │
│   └──────────────────────┬───────────────────────────┬─────────────┘   │
│                          │                           │                 │
│                          ▼                           ▼                 │
│               ┌───────────────────────┐   ┌────────────────────┐       │
│               │  OfflineStorageService│   │  Service Worker    │       │
│               │     (IndexedDB)       │   │     (sw.js)        │       │
│               └──────────┬────────────┘   └────────────────────┘       │
└──────────────────────────┼─────────────────────────────────────────────┘
                           │ HTTPS / WSS / REST
                           │ Cookies: cambusa_at, cambusa_it (HttpOnly)
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Unified Production Docker Container                  │
│                                                                        │
│       ┌────────────────────────────────────────────────────────┐       │
│       │               Nginx Reverse Proxy & Static             │       │
│       │                                                        │       │
│       │  • Serves Angular SPA assets & PWA manifest / sw.js    │       │
│       │  • Proxies /api/* to NestJS on 127.0.0.1:3000          │       │
│       │  • Serves /uploads/products/* with cache headers       │       │
│       └───────────────────────────┬────────────────────────────┘       │
│                                   │                                    │
│                                   ▼                                    │
│       ┌────────────────────────────────────────────────────────┐       │
│       │              NestJS 12 Application (BFF)               │       │
│       │                                                        │       │
│       │  • OIDC / PKCE Authentication Flow                     │       │
│       │  • Tenant Isolation Guard (HouseholdMemberGuard)       │       │
│       │  • Owner Authorization Guard (Household Owner-only)    │       │
│       │  • Domain Services (Pantry, Shopping, Products, Tree)  │       │
│       │  • Bi-directional Sync Engine (LWW + Tombstones)       │       │
│       │  • Sharp WebP Image Pipeline (Multi-Photo & Ordering)  │       │
│       └───────────────────────────┬────────────────────────────┘       │
│                                   │                                    │
│                                   ▼                                    │
│       ┌────────────────────────────────────────────────────────┐       │
│       │           SQLite 3 with better-sqlite3 (WAL Mode)      │       │
│       │                                                        │       │
│       │  • cambusa.sqlite with synchronous = NORMAL            │       │
│       │  • TypeORM 1.1 Object Relational Mapping               │       │
│       └────────────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Principles

### 2.1 Multi-Tenant Household Isolation & Ownership
Every household in Cambusa acts as an autonomous data boundary (tenant).
- Every query across `Product`, `StockItem`, `ShoppingList`, `ShoppingListItem`, `Store`, `ProductStore`, `SavedFilter`, and `SyncTombstone` is strictly scoped by `householdId`.
- Access control is enforced at the controller level using `HouseholdMemberGuard`.
- **Strict Household Ownership**: Renaming or permanently deleting a household is strictly restricted to the household owner (`ownerId === user.id`). Unauthorized requests from shared members are rejected with HTTP 403 Forbidden.
- Users switch between households seamlessly using the top navigation bar dropdown. The selected household is preserved in localStorage and propagated across API requests via the `X-Household-Id` header.

### 2.2 Backend-for-Frontend (BFF) Security Pattern
- Authentication uses OpenID Connect (OIDC) with Authorization Code Flow and PKCE.
- Access tokens, identity tokens, and refresh tokens are stored exclusively inside `HttpOnly`, `SameSite=Lax`, `Secure` browser cookies (`cambusa_at`, `cambusa_it`, `cambusa_rt`).
- JavaScript running in the browser never has access to raw tokens, eliminating token exfiltration via Cross-Site Scripting (XSS).

### 2.3 Infinite Hierarchical Products & Advanced Catalog Rules
- Supports arbitrary nesting depth (e.g., `Produce -> Fresh Fruit -> Citrus -> Oranges -> Tarocco`).
- Products reference parent products via a nullable `parentProductId` relation.
- Cycles are prevented through recursive graph path verification on creation and updates.
- Aggregated stock counts calculate direct item quantities plus all recursive descendant inventory.
- Catalog schema supports multiple barcodes, multiple photos with drag-and-drop ordering, `cannotBeFrozen` constraints against freezer locations, open location relocation rules (`moveOnOpen`), and comprehensive expiration policies.
- **Dedicated Product Modals**:
  - `ProductStockModalComponent`: Inspects pantry batches, current quantities, storage locations, expiration dates with urgency states, opened statuses, prices, and family stock roll-ups from child products.
  - `ProductRelationsModalComponent`: Visualizes the complete parent product hierarchy chain (root ancestors to direct parent) and all child sub-products. Clicking any related product directly opens its editor modal (`ProductEditorModalComponent`), and built-in "View Stock" triggers allow quick inspection of stock batches for any related product via `ProductStockModalComponent`.

### 2.4 Responsive AppShell & Mobile Navigation Architecture
- **Adaptive Floating Navbar & Animated Hamburger Drawer**:
  - On desktop screens, the floating navbar displays full navigation pills (`Home`, `Pantry`, `Shopping List`, `Products`, `Stores`), the active household switcher dropdown, the live sync indicator, and user profile shortcuts.
  - On mobile screens (`<= 768px`), navigation compresses into an animated hamburger button (`.hamburger-btn`) with smooth transformation of three bars into a clean close cross ('X').
  - The household switcher dropdown is automatically moved from the compact mobile navbar into a dedicated section inside the sliding frosted glass drawer (`.mobile-drawer`), allowing full tenant switching on mobile while maintaining uncluttered header space.
  - Brand identity features Concept 2 (Obsidian Mason Jar) SVG vector branding and WebP assets across desktop and mobile.
  - Mobile shell padding and margins are reduced to maximize usable screen real estate and bring cards closer to screen edges on mobile devices (`<= 768px` and `<= 480px`).

### 2.5 Offline-First Resilience & Navbar Sync Architecture
- The web app operates fully offline using IndexedDB (`cambusa_offline_v1`) and a custom Cache-First Service Worker (`sw.js`).
- Local mutations are queued and synchronized bi-directionally with the backend via the `/api/sync` engine upon network reconnection.
- Animated sync indicator in the header displays connectivity status, pending changes count, relative sync timestamp, and server download recovery via CDK Dialog.
- Conflict resolution uses Last-Write-Wins (LWW) timestamp comparisons, and entity deletions are tracked with `SyncTombstone` entries.

### 2.6 10-Second Reversible Actions (Undo System) & Unified Global Toasts
- Every stock-altering mutation (consumption, purchasing, location transfer, and quick expiration date adjustments) registers an inverse compensation closure with `UndoService`.
- A persistent bottom-center popover (`UndoToastComponent`) renders immediately with action details, a smooth 60fps CSS animation countdown progress bar, and an "Undo" trigger.
- **Top-Level Body Attachment & Maximum Stacking Context**: `UndoToastComponent` attaches its host DOM element directly to `document.body` and executes a dynamic `bringToFront()` effect whenever actions or toasts update, re-appending its host as the very last child of `document.body`. Combined with `display: block; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647 !important;`, the overlay floats strictly on top of all `.cdk-overlay-backdrop` blur layers, dialog modals, and menus.
- **Global Notification Alert Stack**: In addition to bottom-center undo timers, `UndoToastComponent` renders global application notifications (`ToastService`) in a top-right toast stack (`.global-toasts-container`) at the same top-level stacking context (`z-index: 2147483647 !important`), ensuring system notices, error alerts, and success confirmations are never obscured by modal backdrops.
- Hovering over the toast pauses the timer and progress bar animation (`isPaused` signal), tracking remaining milliseconds and resuming seamlessly on mouse leave.
- When invoked within the 10-second window, the inverse compensation action executes seamlessly (e.g. re-adding consumed items, deleting purchased stock, moving transferred inventory back to origin, or restoring the prior expiration date) and refreshes local signals without full-page reloads.

### 2.7 4-File Component Architecture & Reusable Directives
- **Strict 4-File Structure**: Every Angular component in the application is strictly partitioned into four standalone files:
  - `<name>.component.ts`: TypeScript class, inputs, outputs, signals, and lifecycle.
  - `<name>.component.html`: Pure HTML template.
  - `<name>.component.scss`: Component-scoped styles.
  - `<name>.component.spec.ts`: Component unit tests.
- **Reusable Primitives**:
  - `CollapsibleSectionComponent`: Standalone animated accordion using CSS grid-row transitions (`grid-template-rows: 0fr -> 1fr`) with overflow visible support when expanded.
  - `QuickDateModifierComponent`: Standalone expiration adjustment buttons (`Today`, `Tomorrow`, `+2d / -2d`, `+5d`, `+7d`).
  - `UndoToastComponent`: Persistent countdown toast for undoable operations with hover-pause support and smooth continuous CSS progress animation.
  - `AutocompleteDirective` (`input[appAutocomplete]`): Dropdown autocomplete directive attaching its menu dynamically relative to the host input element (`input.offsetTop + input.offsetHeight + 4`, `input.offsetLeft`, `input.offsetWidth`), ensuring the dropdown is always glued directly below the text field regardless of hints or validation error messages, with full keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`), active index scrolling, default candidate suggestions on click/focus/empty input, click-outside detection, and form validation state feedback.
  - `LocalDatePipe`: Native browser date formatting pipe that parses `YYYY-MM-DD` string components directly to prevent timezone shifts and formats using `Date.prototype.toLocaleDateString()`.
  - `ConfirmModalComponent`: Reusable confirmation dialog for critical deletions and unsaved modification safeguards without redundant divider lines.

### 2.8 Pantry & Catalog State Synchronization & Search Architecture
- **Consolidated Product-Level Pantry Cards & Stock Batch Editing**:
  - Pantry stock batches are grouped by `productId` into unified product cards displaying the centralized aggregate stock quantity (`calculateProductTotalStock`), earliest expiration date, worst urgency state, and storage locations.
  - Individual batch details (locations, opened state, specific expirations) and actions (consume, purchase, move) are managed through the consolidated product action modal.
  - Specific stock batches can be modified directly via `StockItemEditorModalComponent`, accessible through `✏️ Edit` buttons on every batch list (in `ProductStockModalComponent`, `PantryActionModalComponent`, and single-batch pantry cards), updating expiration dates, storage locations, purchase prices, purchase notes, batch quantities, and opened states with 10-second undo protection (`UndoService`).
- **URL & Browser History Synchronization**:
  - Filter criteria (`group`, `location`, `status`, `sort`), text search query (`q`), and active pagination index (`page`) are bi-directionally synchronized with Angular's `ActivatedRoute` and `Router` query parameters across both Pantry and Products Catalog pages.
  - Synchronous query param restoration avoids overwriting requested page numbers on page reload while asynchronous data fetches complete.
  - Seamlessly integrates with standard browser history events (Back, Forward, and Page Reload), preserving user context across reloads and shares.
- **Real-Time Free-Text Search**:
  - Evaluates matching criteria across product title (`name`), multiline descriptions (`description`), barcodes, and hierarchy paths, allowing instant discovery of products by ingredients, brands, or notes.
- **Paginated Virtual Flow**:
  - Items across both Pantry and Products views are chunked into 24-item pages (`pageSize = 24`), computing total pages, start/end item ranges, and providing intuitive page controls that reflect in URL parameters.
- **Pantry Add Item Workflow & Shared Purchase Panel Architecture**:
  - The "Add Item" action on the pantry page opens `PantryAddItemModalComponent`, featuring a free-text input powered by `AutocompleteDirective` that searches and suggests available products while strictly excluding inactive catalog records (`active !== false`).
  - Upon selecting a product, the modal dynamically displays the unified purchase panel via `StockPurchaseFormComponent`.
  - `StockPurchaseFormComponent` encapsulates all restock and purchase logic: quantity, purchase date, localized expiration datepicker (`CdkDatepickerComponent`), total vs. unit price computation, default store and storage location mapping, purchase notes, and 10-second reversible mutation handling (`UndoService`).
  - The exact same `StockPurchaseFormComponent` is shared and reused inside `PantryActionModalComponent` when selecting the "Purchase" inventory action.

### 2.9 Unsaved Changes Guard Across Dialog Modals
- Dialog components (`ProductEditorModalComponent`, `PantryActionModalComponent`, `PantryAddItemModalComponent`, `ShoppingAddModalComponent`, `HouseholdFormModalComponent`) track form dirty states.
- Modal backdrops are set to `disableClose: true`. Intercepted backdrop clicks, `Escape` key events, and explicit close buttons check whether modifications have occurred.
- If changes are unsaved, a `ConfirmModalComponent` dialog prompts the user ("Discard unsaved changes?"). If confirmed, changes are discarded and the modal closes; otherwise, the user remains in the modal without loss of state.

### 2.10 Aero Glass Design System & OS Theme Engine
- **Dual-Layer Aero Glass Aesthetics & Blur Architecture**:
  - Utilizes frosted glass surfaces with high-performance CSS backdrop filters:
    - **Dialog Backdrops**: `.cdk-overlay-backdrop` and `.modal-backdrop` apply heavy screen blurring (`backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); background-color: rgba(0, 0, 0, 0.55);`), defocusing the underlying application.
    - **Modal Containers**: Dialog shells (`.action-modal-shell`, `.product-editor-shell`, etc.) render as frosted glass sheets (`backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); background-color: var(--glass-modal-bg);`) with high surface opacity (88%–90%) and subtle specular inset borders, eliminating background text collision while displaying rich blur.
    - **Inner Modal Sections**: Nested cards, forms, and summary panels feature secondary glass blur (`blur(12px)`) for hierarchical depth.
    - **Dropdown Menus & Overlays**: Menus (`.dropdown-menu`, `.sync-dropdown`, `.autocomplete-dropdown-panel`, `.undo-toast-shell`) feature frosted glass blurring (`blur(20px)`) and 92%–95% surface opacity with auto-dismissal on outside clicks and `Escape` keypresses.
  - Ambient radial gradients on the body provide depth and soft refraction through frosted glass containers.
- **Floating Island Navigation**:
  - The top navigation bar is detached from the viewport edge as a horizontally-centered, rounded pill island (`max-width: 1240px`, `border-radius: 9999px`) with floating elevation shadows and responsive padding.
- **System-Driven Light / Dark Mode**:
  - Automatically switches between Dark and Light color palettes according to the host OS preference using `@media (prefers-color-scheme: light)` without requiring a manual toggle switch.
  - Variables for backgrounds, surface fills, text, borders, glass cards, and status badges adjust dynamically to ensure optimal contrast and readability across themes.

### 2.11 Home Dashboard, Next Engine & API Integrations
- **Welcome & Analytics Dashboard (`/home`)**:
  - Serves as the primary landing page upon user authentication, greeting the user with time-aware salutations.
  - Features real-time KPI metric cards powered by `/api/next`:
    - Distinct pantry products counted once (`totalUniqueProductsInStock`) regardless of batch variations or multiple stock instances.
    - Total inventory volume across physical stock items (`totalStockItems`).
    - Items expiring soon within the user-configured scan horizon (`expiringSoonCount`).
    - Already expired items requiring immediate review (`expiredCount`).
  - Interactive Pantry Attention Feed with filter pills (`All`, `Expired`, `Expiring Soon`) and direct click-to-modal navigation opening `PantryActionModalComponent` with automatic dashboard metric refresh.
- **Next Engine Feed (`/api/next`)**:
  - Designed for high-frequency dashboard queries and external hardware/software integrations (Home Assistant sensors, e-ink wall displays, CLI scripts).
  - Dual authentication: accepts browser session cookies or machine-to-machine API tokens (`X-API-Key` or `Authorization: Bearer cambusa_ak_...`).
- **Profile & API Keys Management (`/profile`)**:
  - Secure generation, display prefix tracking, and revocation of 256-bit API keys with SHA-256 storage.
  - Configuration of Next engine scan horizon (1–365 days).
  - Smart integration with self-hosted Mealie recipe instances, including URL/token management and live endpoint connectivity verification (`/api/profile/mealie/test`).

### 2.12 Automated Morning Email Notification Service
- **Scheduled Digest Background Engine**:
  - The backend `MailService` runs an automated background scheduler that evaluates configured user dispatches every minute.
  - Compares the server local time against each user's `notificationTime` (24h format, default `06:00` / 6 AM) when `emailNotificationsEnabled` is active.
  - Tracks `lastNotificationSentDate` (`YYYY-MM-DD`) on `UserSettings` to guarantee idempotency and avoid duplicate daily transmissions.
- **Responsive Graphical Digest & Embedded Image Pipeline**:
  - Generates a styled, responsive dark-mode HTML email template with emerald and sky branding accents.
  - Features high-level summary cards (expired count, expiring soon count, total inventory units, scan horizon).
  - Product photos are resolved dynamically via `resolveUploadsDir()`, inherit from parent products when a child product has no image, and are transcoded via Sharp into universally compatible lightweight JPEG thumbnails attached directly as inline MIME attachments (`cid:prod-img-...`). Each product image, title, and "Manage in Pantry →" button includes a direct link (`/home?openProduct=<productId>`) that automatically opens the detail modal on the dashboard.
- **Profile Configuration & Self-Service Testing**:
  - Dedicated "Notifications" management section on the Profile page with SMTP status indicator, custom recipient email input, dispatch time picker, and an instant test button (`POST /api/profile/notifications/test`).

---

## 3. Technology Stack

| Layer | Component | Version / Details |
| :--- | :--- | :--- |
| **Backend Framework** | NestJS | v12.0 (Express, ECMAScript Modules) |
| **Database** | SQLite 3 | `better-sqlite3` v12.x in WAL mode (relational foreign key integrity enforced) |
| **ORM** | TypeORM | v1.1.x |
| **Email Service** | Nodemailer | v6.x (SMTP client, inline CID image embedding, scheduled digests) |
| **Image Processing** | Sharp | v0.35.x (automatic WebP transcoding, multi-picture support) |
| **Authentication** | Jose | v6.x (OIDC JWKS & PKCE verification) |
| **Frontend Framework** | Angular | v22.x (100% Standalone, Signals, 4-file component architecture) |
| **UI Components & Dialogs** | Angular CDK | v22.x (`@angular/cdk/dialog`, `@angular/cdk/drag-drop`) |
| **Local Storage** | IndexedDB | `cambusa_offline_v1` via `OfflineStorageService` |
| **Caching & PWA** | Service Worker | Cache-First for static assets; Network-First for dynamic API |
| **Reverse Proxy** | Nginx | Reverse proxy for NestJS API and static asset server |
| **Process Supervision** | Supervisord | Unified container supervisor managing Nginx and NestJS |
