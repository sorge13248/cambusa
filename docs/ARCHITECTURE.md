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
│   │  • AppShell (Brand, Drawer Switcher, Sync Indicator, Quick Nav)│   │
│   │  • Home Dashboard (/home, Next Engine KPIs, 2-Col Attention)   │   │
│   │  • Pantry (Exp-First, Action Modal: Consume/Purchase/Move)     │   │
│   │  • Products (Collapsible Accordion, Infinite Tree, CDK DnD)    │   │
│   │  • Shopping (Multi-List TabView, Store Routes, In-place Edit)  │   │
│   │  • User Profile & Domains (/profile, TabView, 6 Subcomponents) │   │
│   │  • CDK Dialog Modals (Actions, Add Item, Confirmations)        │   │
│   └──────────────────────┬───────────────────────────┬─────────────┘   │
│                          │                           │                 │
│                          ▼                           ▼                 │
│               ┌───────────────────────┐   ┌────────────────────────────┐       │
│               │  OfflineStorageService│   │ Service Worker (sw.js) &   │       │
│               │     (IndexedDB)       │   │ PwaUpdateService / Modal   │       │
│               └──────────┬────────────┘   └────────────────────────────┘       │
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
│       │  • Proxies ^~ /api/* to NestJS on 127.0.0.1:3000       │       │
│       │  • Ensures /api/ media endpoints bypass regex assets   │       │
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
- Catalog schema supports multiple barcodes, multiple photos with drag-and-drop ordering, `cannotBeFrozen` constraints that omit freezer locations across purchase, transfer, and edit workflows, prevent storage in freezer locations, and automatically nullify freeze/thaw expiration policies in the database, open location relocation rules (`moveOnOpen`), and comprehensive expiration policies.
- **Dedicated Product Modals & Shared Detail View**:
  - `ProductDetailViewComponent`: Reusable 4-file component (`mode = input<'info' | 'edit'>('edit')`) rendering the product header, interactive `StarRatingComponent` (in `info` mode), all 8 collapsible catalog sections, and a collapsed-by-default `Household Member Ratings` section when `mode === 'info'` and the household has multiple members (`memberCount > 1`).
  - `ProductInfoModalComponent`: Read-only CDK Dialog showcase that renders a dedicated product-info layout in `info` mode—displaying the interactive photo gallery, title, description, `StarRatingComponent`, and populated specification cards (`Stock & Quantity`, `Storage & Store`, `Expiration & Shelf Life`) immediately while omitting unpopulated fields and keeping minor sections (`Barcodes & EAN/UPC`, `Store Aisles & Prices`, `Mealie Integration`, and `Household Member Ratings`) collapsed by default when populated. Its footer provides quick actions to open `ProductRelationsModalComponent`, `ProductStockModalComponent`, or switch in-place to `ProductDetailViewComponent` in `edit` mode without opening a separate modal, and its product group pill navigates directly to `/pantry?group=<id>` with the group filter pre-selected. All existing-product entry points (Products catalog, Pantry Action Modal, Product Relations Modal, and Shopping List) open `ProductInfoModalComponent`.
  - `ProductEditorModalComponent`: CDK Dialog host wrapping `ProductDetailViewComponent` in `edit` mode for creating new products.
  - `StarRatingComponent`: Reusable 4-file star rating control (`1` to `5` stars or `null` unrated) with hover preview and an explicit `Clear` button (clicking an already-assigned star preserves the selection).
  - `ProductStockModalComponent`: Inspects pantry batches, current quantities, storage locations, expiration dates with urgency states, opened statuses, prices, and family stock roll-ups from child products.
  - `ProductRelationsModalComponent`: Visualizes the complete parent product hierarchy chain (root ancestors to direct parent) and all child sub-products. Clicking any related product (parent, child, or descendant) opens a new `ProductRelationsModalComponent` stacked on top for that selected product, while built-in "View Stock" and "Info" triggers allow quick inspection of stock batches (`ProductStockModalComponent`) or product details (`ProductInfoModalComponent`).

### 2.4 Responsive AppShell & Mobile Navigation Architecture
- **Adaptive Floating Navbar & Animated Hamburger Drawer**:
  - On desktop screens, the floating navbar displays full navigation pills (`Pantry`, `Shopping List`, `Products`), the active household switcher dropdown, the live sync indicator, and user profile shortcuts. Stores and aisles management is consolidated exclusively within the Domains tab of the User Profile.
  - On mobile screens (`<= 768px`), navigation compresses into an immediate quick navigation bar (Home, Pantry, Shopping List, Products icons powered by `@lucide/angular`) and an animated hamburger button (`.hamburger-btn`) with smooth transformation of three bars into a clean close cross ('X').
  - The household switcher dropdown is automatically moved from the compact mobile navbar into a dedicated section inside the sliding frosted glass drawer (`.mobile-drawer`), allowing full tenant switching on mobile while maintaining uncluttered header space.
  - Brand identity features Concept 2 (Obsidian Mason Jar) SVG vector branding and WebP assets across desktop and mobile.
  - Mobile shell padding and margins are reduced to maximize usable screen real estate and bring cards closer to screen edges on mobile devices (`<= 768px` and `<= 480px`).
  - **Fullscreen Square Modals on Mobile**: Feature modals expand to full viewport dimensions (`100vw`, `100dvh`) with square edges (`border-radius: 0`) and widened touch-accessible close buttons (`padding: 10px 20px`), while confirmation dialogs remain centered floating cards. Form rows inside action modals wrap vertically on narrow viewports to avoid input truncation.
  - **Vector Iconography**: Vector icons from `@lucide/angular` provide consistent SVG rendering, inheriting theme colors and strokes throughout all navigation elements, dialog buttons, and item indicators.

### 2.5 Multi-List Shopping Architecture & Default Selection
- **Household-Level Default Lists**: Each household can define a default shopping list (`isDefault: true`). Creating or updating a list as default automatically unsets prior defaults for that household. Navigating to `/shopping` without a query parameter automatically selects and renders the default list.
- **Card Metadata & Safe Mutation**: Shopping cards feature inline quantities and notes, full-width two-column layout for product group badges and current pantry stock counts, and deletion confirmation modal protection.

### 2.6 Offline-First Resilience, Update Engine & Navbar Sync Architecture
- **Zero Direct API Mutations**: The entire frontend operates strictly offline-first. Mutation methods across `ApiService` (`addStock`, `consumeStock`, `openStock`, `adjustDate`, `transferStock`, `updateStockItem`, `deleteStockItem`, `addShoppingItem`, `updateShoppingItem`, `toggleShoppingItemDone`, `deleteShoppingItem`, `createProduct`, `updateProduct`, `deleteProduct`, `createShoppingList`, etc.) write directly to local IndexedDB stores (`products`, `stock`, `shopping_items`, `shopping_lists`) and local in-memory signal state first. No direct REST mutation calls are made across domain flows.
- **Background Synchronization Pipeline**: Each local write enqueues a task to the `sync_queue` store and triggers `SyncService.sync()` in the background. The sync engine flushes pending changes and deletions via `POST /api/sync`, receives server deltas and tombstones, updates local stores, and notifies components.
- The web app operates fully offline using IndexedDB (`cambusa_offline_v1`) and a custom Service Worker (`sw.js`) implementing SPA navigation fallback and Stale-While-Revalidate caching for static chunks and assets.
- `PwaUpdateService` continuously monitors service worker updates (every 20 minutes, tab visibility, online events) and prompts the user via `UpdateModalComponent` with a persistent topbar update badge.
- Animated sync indicator in the header displays connectivity status, pending changes count, relative sync timestamp, and server download recovery via CDK Dialog.
- Conflict resolution uses Last-Write-Wins (LWW) timestamp comparisons, and entity deletions are tracked with `SyncTombstone` entries.

### 2.7 10-Second Reversible Actions (Undo System) & Unified Global Toasts
- Every stock-altering mutation (consumption, purchasing, opening batches, location transfer, and quick expiration date adjustments) registers an inverse compensation closure with `UndoService`.
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
  - `TabViewComponent`: Standalone responsive tab navigation component with support for typed tab items, signal two-way binding (`[(activeTabId)]="tab"`), icons, count/status badges with custom badge variants (`primary`, `success`, `warning`, `danger`, `neutral`), styling variants (`default`, `subtle`, `pill`), and CDK Drag & Drop reordering support (`[reorderable]="true"` with drop placeholder animations and `(reordered)` outputs). Reused across shopping list selection, user profile subpages, and domain management.
  - `CollapsibleSectionComponent`: Standalone animated accordion using CSS grid-row transitions (`grid-template-rows: 0fr -> 1fr`) with overflow visible support when expanded.
  - `QuickDateModifierComponent`: Standalone expiration adjustment buttons (`Today`, `Tomorrow`, `+2d / -2d`, `+5d`, `+7d`).
  - `UndoToastComponent`: Persistent countdown toast for undoable operations with hover-pause support and smooth continuous CSS progress animation.
  - `AutocompleteDirective` (`input[appAutocomplete]`): Dropdown autocomplete directive attaching its menu dynamically relative to the host input element (`input.offsetTop + input.offsetHeight + 4`, `input.offsetLeft`, `input.offsetWidth`), ensuring the dropdown is always glued directly below the text field regardless of hints or validation error messages, with full keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`), active index scrolling, default candidate suggestions on click/focus/empty input, click-outside detection, and form validation state feedback.
  - `LocalDatePipe`: Native browser date formatting pipe that parses `YYYY-MM-DD` string components directly to prevent timezone shifts and formats using `Date.prototype.toLocaleDateString()`.
  - `NumberStepperComponent`: Reusable parameterizable quantity stepper component with increment (`+`) and decrement (`-`) buttons, optional unit display, disabled states, and native browser spin arrow suppression (`-webkit-appearance: none; -moz-appearance: textfield;`), adhering strictly to the 4-file standalone structure. Integrated across inventory consumption, purchase restock, room transfer, shopping item addition/edition, and individual batch modification.
  - `ConfirmModalComponent`: Reusable confirmation dialog for critical deletions and unsaved modification safeguards without redundant divider lines.
  - `QuickActionsFooterComponent`: Fixed bottom-centered quick actions toolbar present on Home, Pantry, and Products views, providing single-tap access to Quick Consume and continuous Quick Purchase flows.
  - `PantryQuickConsumeModalComponent` & `QuickConsumeConfirmModalComponent`: Camera-driven barcode scanning workflow for rapid pantry consumption. Features concurrency locking (`isScanningLocked` on `BarcodeScannerComponent` and active modal reference tracking on `PantryQuickConsumeModalComponent`) preventing multi-frame duplicate modal triggers, barcode detection anti-bounce cooldown (4 seconds), and autocomplete blur deduplication. Scans an item or accepts an autocomplete selection, automatically resolves the earliest expiring batch in stock, and triggers a confirmation dialog featuring an auto-approving countdown timer (configurable per user via `quickConsumeTimerSeconds`, default 10s) wrapped in `NgZone` to ensure reliable automatic closure upon timeout, an immediate "Mark as Open" button to mark the item opened without waiting for the timer, and 10-second reversible compensation closure via `UndoService`.
  - `CambusaTitleStrategy`: Custom Angular `TitleStrategy` ensuring unified, brand-aligned page titles (`<Route Title> — Cambusa`) across all application routes (`Dashboard`, `Pantry`, `Shopping List`, `Products Catalog`, `Households`, `Profile & Settings`, `Sign In`), falling back gracefully to `Cambusa — Smart Home Pantry & Grocery Management`.
  - `BackNavigationService`: Intercepts browser back actions (including Android swipe-back gestures) using history state push/pop tracking. Collapsible sections register with the service so pressing Back closes any expanded collapsibles first. If none are open, it closes the topmost open modal dialog in Last-In-First-Out (LIFO) order, only navigating browser history once all overlays and accordion panels are closed. Angular CDK Dialog is configured with `DEFAULT_DIALOG_CONFIG` (`hasBackdrop: true, closeOnNavigation: false`) to guarantee backdrop creation across all dialog instances while safeguarding dialog overlays against unexpected popstate disposal, and `OVERLAY_DEFAULT_CONFIG` (`usePopover: false`) to disable native popover Top Layer promotion, ensuring CSS `backdrop-filter: blur(...)` correctly defocuses the application behind modal backdrops and preserving top-level stacking contexts for `UndoToastComponent`.

### 2.8 Pantry & Catalog State Synchronization & Search Architecture
- **Consolidated Product-Level Pantry Cards & Stock Batch Editing**:
  - Pantry stock batches are grouped by `productId` into unified product cards displaying the centralized aggregate stock quantity (`calculateProductTotalStock`), earliest expiration date, worst urgency state, and storage locations.
  - Active catalog products (`active !== false`) with zero stock across themselves and all of their descendants (children, grandchildren, etc. at any nesting depth) are also surfaced in `PantryInventoryGridComponent` (`mode="pantry"`) at reduced opacity with a red `Out of stock` badge (and can be isolated via the `Out of Stock` status filter). Products with zero direct stock whose descendants hold stock are not treated as out of stock. Out-of-stock cards disable `Open 1` and `Consume 1` and omit the quick date modifier while keeping `Manage` available to open `PantryActionModalComponent` for immediate restocking.
  - Individual cards provide direct inline `Consume 1` and `Open 1` quick action triggers. `Open 1` targets the earliest expiring unopened batch; if the batch contains multiple items (`amount > 1`), the batch is cleanly split by decrementing the source batch by 1 and creating an independent 1-unit stock item marked opened, recalculating shelf-life and move-on-open location, and registering a 10-second undo closure with `UndoService` that merges the opened unit back.
  - Individual batch details (locations, opened state, specific expirations) and actions (consume, purchase, move) are managed through the consolidated product action modal with streamlined inline quick date modifiers.
  - Specific stock batches can be modified directly via `StockItemEditorModalComponent`, accessible through `✏️ Edit` buttons on every batch list (in `ProductStockModalComponent`, `PantryActionModalComponent`, and single-batch pantry cards), updating expiration dates, storage locations, purchase prices, purchase notes, batch quantities, and opened states with 10-second undo protection (`UndoService`).
- **Universal Floating Action Buttons (FAB)**:
  - Primary inventory and catalog creation actions (`+ Add Item` and `💾 Save Current View` in Pantry, `+ Add Product` in Products, and `+ Add Item` in Shopping List) are anchored as universal Floating Action Buttons (FAB) at the bottom-right of the viewport for rapid, one-thumb access across all screen sizes. When `QuickActionsFooterComponent` is mounted, FAB containers automatically elevate (`bottom: 84px` desktop, `bottom: 74px` mobile) to eliminate overlap with the bottom toolbar.
- **URL & Browser History Synchronization, Debounced Search & Instant Filter Reset**:
  - Filter criteria (`group`, `location`, `status`, `sort`), text search query (`q`), and active pagination index (`page`) are bi-directionally synchronized with Angular's `ActivatedRoute` and `Router` query parameters across both Pantry and Products Catalog pages.
  - Text search fields debounce query parameter synchronization by 1 second (1000ms) to prevent polluting browser history with single-character navigation entries, while updating in-memory signals and local filtering results immediately. Explicit clear-search actions and non-text dropdown filters synchronize query parameters immediately without debounce.
  - An instant filter reset button (`Reset Filters` / `Clear Filters`) allows one-click clearing of all search terms and category/location/status/sorting filters, resetting pagination and clearing query parameters from the browser URL.
  - The "Expiring Soon" status filter dynamically reads the user's configured scan horizon (`nextExpiringDays` from the `/next` engine user profile configuration) and reflects the active threshold in the select dropdown label (`Expiring Soon (≤ Nd)`).
  - Synchronous query param restoration avoids overwriting requested page numbers on page reload while asynchronous data fetches complete.
  - Seamlessly integrates with standard browser history events (Back, Forward, and Page Reload), preserving user context across reloads and shares.
- **Real-Time Free-Text Search**:
  - Evaluates matching criteria across product title (`name`), multiline descriptions (`description`), barcodes, and hierarchy paths, allowing instant discovery of products by ingredients, brands, or notes.
- **Paginated Virtual Flow & Global Scroll Restoration**:
  - Items across both Pantry and Products views are chunked into 24-item pages (`pageSize = 24`), computing total pages, start/end item ranges, and providing intuitive page controls that reflect in URL parameters.
  - Changing pages on paginated views smoothly restores scroll position to the top of the window, paired with Angular Router's global `withInMemoryScrolling({ scrollPositionRestoration: 'top' })` ensuring all page navigations start at the top.
- **Pantry Add Item Workflow & Shared Purchase Panel Architecture**:
  - The "Add Item" action on the pantry page opens `PantryAddItemModalComponent`, featuring a free-text input powered by `AutocompleteDirective` that searches and suggests available products while strictly excluding inactive catalog records (`active !== false`).
  - If a typed product does not yet exist in the catalog, `PantryAddItemModalComponent` provides an inline "+ New Product" button and empty state action that opens `ProductEditorModalComponent` prefilled with the typed query. Upon creation, the new product is automatically selected in the purchase form without requiring the user to re-open the dialog.
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
    - **Dialog Backdrops**: `.cdk-overlay-backdrop` and `.modal-backdrop` apply heavy screen blurring (`backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); background-color: rgba(0, 0, 0, 0.55);`), defocusing the underlying application. Overlays are attached directly to the document root rather than native Top Layer popovers (`OVERLAY_DEFAULT_CONFIG: { usePopover: false }`), ensuring `backdrop-filter` consistently samples and blurs the underlying page across all browsers.
    - **Modal Containers**: Dialog shells (`.action-modal-shell`, `.product-editor-shell`, etc.) render as frosted glass sheets (`backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); background-color: var(--glass-modal-bg);`) with high surface opacity (88%–90%) and subtle specular inset borders, eliminating background text collision while displaying rich blur.
    - **Inner Modal Sections**: Nested cards, forms, and summary panels feature secondary glass blur (`blur(12px)`) for hierarchical depth.
    - **Dropdown Menus & Overlays**: Menus (`.dropdown-menu`, `.sync-dropdown`, `.autocomplete-dropdown-panel`, `.undo-toast-shell`) feature frosted glass blurring (`blur(20px)`) and 92%–95% surface opacity with auto-dismissal on outside clicks and `Escape` keypresses.
  - Ambient radial gradients on the body provide depth and soft refraction through frosted glass containers.
- **Floating Island Navigation**:
  - The top navigation bar is detached from the viewport edge as a horizontally-centered, rounded pill island (`max-width: 1240px`, `border-radius: 9999px`) with floating elevation shadows and responsive padding.
- **System-Driven Light / Dark Mode**:
  - Automatically switches between Dark and Light color palettes according to the host OS preference using `@media (prefers-color-scheme: light)` without requiring a manual toggle switch.
  - Variables for backgrounds, surface fills, text, borders, glass cards, and status badges adjust dynamically to ensure optimal contrast and readability across themes.
- **Mobile-First Modal Engine & Responsive Form Wrapping**:
  - On mobile viewport devices (`@media (max-width: 768px)`), dialog modals expand to full screen (`100vw`, `100dvh`) with sharp square edges (`border-radius: 0`) and edge-to-edge layout, while confirmation modals (`ConfirmModalComponent`) retain centered card presentation with rounded corners as critical safety safeguards.
  - Form rows across `ProductEditorModalComponent` and `StockItemEditorModalComponent` wrap automatically into single-column vertical flows on mobile displays, preventing horizontal truncation and input squishing.
  - Product relations and ancestor cards wrap action triggers onto dedicated bottom rows, granting full horizontal width to product names.
  - Shopping list items feature responsive grid layout with top-right actions and lower-tier metadata routes, preventing badge collision and letter-by-letter title wrapping.

### 2.11 Home Dashboard, Next Engine & API Integrations
- **Welcome & Analytics Dashboard (`/home`)**:
  - Serves as the primary landing page upon user authentication, greeting the user with time-aware salutations.
  - Features real-time KPI metric cards powered by `/api/next`:
    - Distinct pantry products counted once (`totalUniqueProductsInStock`) regardless of batch variations or multiple stock instances.
    - Total inventory volume across physical stock items (`totalStockItems`).
    - Items expiring soon within the user-configured scan horizon (`expiringSoonCount`).
    - Already expired items requiring immediate review (`expiredCount`).
    - On mobile viewports (`<= 768px`), KPI boxes feature a compact 2x2 grid with reduced padding and typography to maximize viewport efficiency.
  - **Two-Column Attention Feed**:
    - Dispatches expired and expiring items into two equal-width parallel columns: "Expired Products" (Column 1) and "Expiring Soon" (Column 2).
    - Removes manual filter buttons and the quick action sidebar, dedicating the full dashboard width to urgent inventory feeds.
    - Each feed card renders the product photo thumbnail (or package icon fallback) alongside quantity, location, best-before date, and urgency/opened badges, matching the Pantry card styling.
    - Clicking any feed card opens `PantryActionModalComponent` with direct action support.
  - **Optimistic State Updates (`applyOptimisticAction`)**:
    - When inventory operations (`consume`, `open`, `adjustDate`, `move`, `purchase`) are triggered from pantry action modals or the quick actions footer, the dashboard modifies its `nextData` signal state in place immediately.
    - Total inventory volume, unique product counts, expired/expiring counts, and item lists update with zero latency without triggering API requests or showing loading spinners.
  - **Zero-Network Snapshot Undo Stack**:
    - On every user action, a deep copy of the active `NextResponseDto` state is saved into `undoSnapshotStack`.
    - When `UndoService.onUndoExecuted` fires, the previous dashboard snapshot is popped and restored directly into the `nextData` signal, giving instantaneous 100% network-free undo reflection without reloading data from the server.
    - If a state refresh is needed outside the snapshot stack, `computeNextDataLocally` derives the full dashboard state deterministically from local IndexedDB data.
- **Next Engine Feed (`/api/next`)**:
  - Designed for high-frequency dashboard queries and external hardware/software integrations (Home Assistant sensors, e-ink wall displays, CLI scripts).
  - Dual authentication: accepts browser session cookies or machine-to-machine API tokens (`X-API-Key` or `Authorization: Bearer cambusa_ak_...`).
- **Profile, Subpages & Domain Management (`/profile`)**:
  - Modular subpage layout partitioning user configuration across 6 dedicated standalone components managed via `<app-tabview>`:
    - `ProfileIdentityComponent`: OIDC user identity, avatar, display name, and email claims.
    - `ProfileExpirationsComponent`: Next engine scan horizon threshold (1–365 days).
    - `ProfileMealieComponent`: Mealie base URL, API bearer token, live connectivity testing, and recipe sync status.
    - `ProfileNotificationsComponent`: Daily morning email digest toggle, 24-hour dispatch time picker, recipient address override, and instant sample email test.
    - `ProfileApiKeysComponent`: Generation, display prefixing, and revocation of 256-bit API keys with secure raw key display banner.
    - `ProfileDomainsComponent`: Centralized domain management with sub-tabs for Stores and Aisles, including CDK Drag & Drop reordering with placeholders and inline editing.
  - Secure generation, display prefix tracking, and revocation of 256-bit API keys with SHA-256 storage.
  - Configuration of Next engine scan horizon (1–365 days).
  - Smart integration with self-hosted Mealie recipe instances, including URL/token management and live endpoint connectivity verification (`/api/profile/mealie/test`).

### 2.13 Mealie Recipes & Foods Integration Architecture
- **Bidirectional Product-to-Mealie Mapping & Recursive Ancestor Inheritance**:
  - Products maintain `mealieFoods` (`{ id, name }[]`) and `mealieRecipes` (`{ id, slug, name }[]`) simple-json columns, enabling N:M mappings between Cambusa products and Mealie foods and explicit recipes.
  - Child products automatically inherit all mapped Mealie foods and recipes from their entire parent hierarchy (both direct parents and recursive ancestors). `MealieService.getProductRecipes()` traverses ancestor products within the active household, deduplicates entries by ID, and resolves matching recipes for all aggregated food mappings.
  - The Product Editor modal features a dedicated "Mealie" collapsible section (visible only when the user has configured domain and token), displaying inherited ancestor items with "Inherited" badges alongside directly mapped links.
  - Multi-select autocomplete dialogs (`MealieLinkModalComponent`) enable users to select multiple foods or recipes simultaneously by clicking anywhere on item rows, featuring checkboxes, search filtering, a selected items chip preview bar, and full dark-mode alignment with the Aero Glass design system (`var(--glass-modal-bg)`, `backdrop-filter: blur(24px)`).
- **4-Hour Caching Engine & Invalidation Protocol**:
  - The backend `MealieService` provides an in-memory caching layer with a 4-hour TTL (`14_400_000` ms) for foods lists (`foods:<userId>`), recipes lists (`recipes:<userId>`), and product-specific recipe discovery (`product-recipes:<userId>:<productId>`).
  - Cache entries store timestamps (`cachedAt`, `expiresAt`). Passing `?refresh=true` invalidates the cached entry and re-fetches live data from Mealie.
  - Updating or deleting any product automatically invalidates its cached recipe recommendations (`clearProductCache(id)`), ensuring subsequent queries fetch fresh data.
- **Recipe Discovery & Food Links in Pantry Modal**:
  - When opening `PantryActionModalComponent`, Mealie recipes containing the product's linked ingredients (queried via Mealie's SQL-like `queryFilter=recipeIngredient.food.id IN [...]`) and explicitly linked recipes are loaded and presented.
  - The "Mealie Recipes & Foods" card inside `PantryActionModalComponent` is dynamically hidden when a product has no associated Mealie recipes and no associated Mealie foods, preventing visual noise on unlinked pantry items.
  - Recipes are rendered in a responsive grid of max 3 items per row showing thumbnail images, titles, and preparation times (with ISO 8601 duration parsing). Clicking opens `/g/home/r/:slug` in a new tab.
  - Linked foods are displayed as clickable pills linking directly to `/g/home?foods=:uuid` to inspect all recipes containing that food on Mealie.
  - Editing a product directly from the pantry modal refreshes the underlying view's Mealie recipes and foods in place immediately upon modal closure, without requiring a browser page reload.
- **Backend Image Proxy**:
  - Mealie thumbnails are served via `GET /api/mealie/recipes/:recipeId/image`, streaming authenticated WebP images directly to the client with `Cache-Control: public, max-age=86400` to eliminate CORS, mixed-content, or Bearer auth limitations.

### 2.14 Automated Morning Email Notification Service
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

### 2.15 Shopping Lists & Store Aisle Architecture
- **Multi-List TabView with Drag & Drop Reordering & Wrapped Layout**:
  - Shopping lists render as tabs using `TabViewComponent` with CDK drag-and-drop reordering (`cdkDropList`, `cdkDrag`, `*cdkDragPlaceholder`).
  - The tabs container supports non-scrolling multiline wrapping (`[wrap]="true"` with `cdkDropListOrientation="mixed"` and `flex-wrap: wrap`), eliminating horizontal clipping and overflow scrolling even when managing numerous shopping lists.
  - Active list selection is synchronized with browser history and URL query parameters (`?list=<id>`), seamlessly handling browser Back, Forward, and Page Reload actions.
- **Offline-First Drag & Drop Persistence Protocol**:
  - Reordering shopping lists adheres to strict offline-first principles: changes are applied immediately to local in-memory signals, persisted to client-side storage (`localStorage` and IndexedDB meta via `OfflineStorageService`), and queued for background replication (`SyncQueueItem` with `entity: 'shopping_list'`).
  - The frontend transmits the updated sequence via `POST /api/shopping-list/reorder` and `POST /api/sync`, storing the sequence on the `sortOrder` column of `ShoppingList`.
  - When offline or during network dropouts, lists reload faithfully in their custom order from local storage; upon reconnecting, `SyncService` synchronizes the sequence with the backend.
- **Aisle Grouping Strictly Tied to Associated Store**:
  - Store aisles are used exclusively when that same store is associated with the active shopping list being consulted (`ShoppingList.storeId`).
  - Items within a list are grouped into distinct aisle section cards with headers, icons, and item counters based on the associated store's walking order.
  - If a shopping list is not associated with any store (`storeId: null`), store aisles are strictly not used, and items are organized into a general items group.
  - For store-associated lists, an "Unspecified Aisle" section is displayed for items that do not have an aisle mapped in that specific store; no aisle leaking or fallback across unrelated stores is permitted.
- **Custom Item Drag & Drop Reordering**:
  - Items within aisle groups support custom drag-and-drop sequencing via CDK Drag and Drop with visual drop placeholders. Reordering updates local signal state and persists sequence ordering via `POST /api/shopping-list/items/reorder` (`sortOrder`).
- **In-Place Catalog Product Editing**:
  - Every shopping list item provides a direct shortcut to open `ProductInfoModalComponent`, enabling immediate inspection of product metadata, ratings, barcodes, categories, and store aisles (with an in-place switch to edit mode) without navigating away from the shopping list.

### 2.16 In-Browser Barcode & QR Code Camera Scanner Subsystem
- **In-Page Viewfinder Integration**:
  - Accesses the device camera directly within the web page via WebRTC `navigator.mediaDevices.getUserMedia`, streaming live frames to an embedded `<video playsinline autoplay muted>` element inside an Aero Glass viewfinder box with targeting corner reticles and an animated laser scanline.
  - Does not open the operating system's native camera app or file chooser dialogs, ensuring an uninterrupted single-page app experience.
- **Camera Switching & Flashlight / Torch Controls**:
  - Supports dynamic switching between rear (`'rear'`) and front (`'front'`) cameras via two-way `camera` model signals, automatically updating video constraints (`facingMode: { ideal: 'environment' | 'user' }`).
  - Utilizes `navigator.mediaDevices.enumerateDevices()` and `track.getCapabilities().facingMode` to detect if the client device possesses multiple video cameras. On single-camera systems (such as laptops or single-lens webcams), the camera flip button is automatically hidden.
  - Includes integrated flashlight/torch control via `track.applyConstraints({ advanced: [{ torch: boolean }] })`, inspecting track capabilities (`capabilities.torch`) and automatically hiding the flash button when the active camera or device does not support hardware illumination.
- **Dual-Engine Scanning Architecture with Omnidirectional (0°, 90°, 180°, 270°) Support**:
  - **Hardware-Accelerated Native API**: Utilizes the modern native `BarcodeDetector` API (`window.BarcodeDetector`) when available in Chromium and iOS 17+ Safari, detecting 1D barcodes (EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, ITF) and 2D matrix codes (QR Code, Data Matrix) at zero CPU overhead. If initial horizontal detection returns no matches, it automatically tests sideways (90° clockwise and 270° counter-clockwise) and upside-down (180°) orientations using a full-resolution offscreen canvas rotation frame, ensuring barcodes held in any physical orientation are decoded reliably.
  - **Universal ZXing Fallback**: Automatically activates a pure JavaScript `@zxing/browser` `BrowserMultiFormatReader` fallback configured with `DecodeHintType.TRY_HARDER` for browsers lacking native detection (such as desktop/mobile Firefox), performing cyclic canvas frame rotations across 0°, 90°, 270°, and 180° to decode codes in any physical orientation.
- **Audio & Haptic Feedback**:
  - Emits synthesized audio confirmation using the Web Audio API (`AudioContext` sine oscillator at 880Hz ramping to 1760Hz, zero external asset dependencies) and triggers haptic pulses (`navigator.vibrate`) upon successful code detection.
- **Reusable Standalone Architecture**:
  - Fully encapsulated as a standalone 4-file Angular 22 component (`BarcodeScannerComponent`) with Angular Signals (`input`, `model`, `output`). Emits scanned code strings via `scanned = output<string>()`, allowing parent components (`ProductEditorModalComponent`, `ShoppingAddModalComponent`, `PantryAddItemModalComponent`) to embed inline camera viewfinders that automatically close upon code detection.

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
| **Barcode & QR Scanner** | WebRTC + ZXing | `navigator.mediaDevices.getUserMedia`, native `BarcodeDetector` + `@zxing/browser` fallback |
| **Local Storage** | IndexedDB | `cambusa_offline_v1` via `OfflineStorageService` |
| **Caching & PWA** | Service Worker | Stale-While-Revalidate for static assets; SPA navigation fallback to precached `/index.html`; `PwaUpdateService` with update modal |
| **Reverse Proxy** | Nginx | Reverse proxy for NestJS API and static asset server |
| **Process Supervision** | Supervisord | Unified container supervisor managing Nginx and NestJS |
