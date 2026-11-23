# Cambusa

Private-first, self-hostable home pantry, grocery shopping, and inventory system with offline-first PWA resilience, multi-tenant household management, and intelligent aisle-sorted shopping.

---

## Features

- **Home Dashboard & Next Engine (`/home`)**:
  - Time-aware greeting and welcome banner with active household context.
  - KPI metric cards powered by `/api/next`:
    - **Distinct Products in Stock** (`totalUniqueProductsInStock`): Counted once regardless of batches or package amounts.
    - **Total Inventory Units** (`totalStockItems`): Aggregated volume across all pantry locations.
    - **Expiring Soon** (`expiringSoonCount`): Highlighted alerts within user-configured scan horizon.
    - **Expired Items** (`expiredCount`): Urgent alerts for items overdue.
  - Interactive Pantry Attention Feed with filter tabs (`All`, `Expired`, `Expiring Soon`), overdue/due-date badges, opened badges, and direct click-to-modal opening of `PantryActionModalComponent` with automatic dashboard metric refresh.
  - Quick action shortcuts to Pantry, Shopping List, Product Master Data, and Profile Integrations.
- **Next Engine Feed & Automation (`/api/next`)**:
  - High-performance, JSON-driven endpoint for external dashboard widgets, Home Assistant sensors, and e-ink displays.
  - Dual authentication: supports browser session cookies or bearer/header API keys (`X-API-Key: cambusa_ak_...` or `Authorization: Bearer cambusa_ak_...`).
  - Configurable scan horizon per user with optional query overrides (`?days=7`).
- **User Profile & Integrations (`/profile`)**:
  - **API Key Management**: Generate, list (with display prefixes), and revoke 256-bit cryptographically secure API keys with SHA-256 storage, raw key copy-to-clipboard, and CDK confirmation modals.
  - **Smart Mealie Integration**: Configure Mealie instance URL and Bearer token, with live endpoint testing (`/api/profile/mealie/test`) reporting online version and total recipe counts.
  - **Next Horizon Configuration**: Configure the number of days ahead (1–365) scanned by the Next engine.
  - **Daily Morning Email Digest Notifications**: Configure recipient notification email address, toggle daily morning automated dispatches, set preferred dispatch time in 24-hour format (default `06:00` / 6 AM), and send on-demand test emails (`POST /api/profile/notifications/test`) with live SMTP status feedback.
  - **Automated Email Service**: Daily scheduled background engine dispatching high-fidelity graphical HTML summaries with KPI badges, days overdue, days remaining, and inline product photos embedded directly as CID attachments from local storage.
- **Aero Glass Design System & Concept 2 Brand Identity**:
  - Vector SVG logo and WebP icons featuring Concept 2 (Obsidian Mason Jar with emerald/sky illumination) across PWA manifest, favicons, apple touch icons, and navigation bar.
  - Frosted glass aesthetics with dual-layer blur: dialog backdrops blur the underlying screen (`backdrop-filter: blur(14px)`), modal containers render as frosted translucent sheets (`backdrop-filter: blur(24px)`), inner sections and cards provide secondary glass refraction (`blur(12px)`), and floating dropdowns feature heavy frosted blurring (`blur(20px)`).
  - Horizontally-centered, rounded floating pill navigation island (`AppShellComponent`) with responsive edge padding.
  - Automatic OS-native Light and Dark modes adapting instantaneously to user system preferences (`@media (prefers-color-scheme)`) without manual switch toggles.
  - Browser-native local date formatting (`LocalDatePipe`) rendering all expiration and purchase dates in the user's localized format (e.g. `dd/mm/yyyy` in Europe/IT) without UTC timezone shifting.
- **Pantry & Stock Management**:
  - Expiration-date first ordering by default, with urgency color badges (expired, due soon, good).
  - Sentinel expiration normalization: products that never expire have `null` dates (sentinel values like Grocy's `2999-12-31` are normalized to `null` across database imports, API queries, and datepickers).
  - Consolidated product cards: inventory batches belonging to the same product are grouped into unified product cards displaying total centralized stock (`calculateProductTotalStock`), earliest expiration date, worst urgency status, and storage locations, with full batch-by-batch control inside the action modal.
  - Real-time free-text search filtering across product names and HTML descriptions.
  - URL query parameter synchronization (`q`, `group`, `location`, `status`, `sort`, `page`) seamlessly connected to browser history (Back, Forward, and Reload).
  - Responsive pagination (24 items per page) with page number indicators, total item counters, and smooth previous/next navigation.
  - Reusable quick expiration date modifier (`QuickDateModifierComponent`) embedded both on pantry cards and inside action modals (`Today`, `Tomorrow`, `+2d / -2d`, `+5d`, `+7d`).
  - Comprehensive Product Action Modal (**Consume**, **Purchase**, **Move**):
    - **Consume**: consume discrete amounts or specific opened/unopened stock batches, with spoiled disposal tracking and whole integer stepper inputs.
    - **Purchase**: purchase and restock items with location, store, price, quantity, and custom datepicker (quick presets + "Never expires" toggle).
    - **Move**: transfer stock between locations with strict freezer safety checks (`cannotBeFrozen`) and automatic expiration recalculation upon freezing and thawing.
    - **Edit Product**: direct action button to open the product editor with optimistic in-place inventory updating.
  - **10-Second Reversible Actions (Undo System) & Unified Global Toasts**: Every inventory mutation (consume, purchase, transfer, quick date modification) registers with `UndoService`, triggering a persistent bottom-center toast (`UndoToastComponent`) with a smooth 60fps countdown progress bar to revert the operation. Attached directly to `document.body` and automatically brought to front on every update with maximum stacking context `z-index: 2147483647 !important` and host `position: fixed; inset: 0; pointer-events: none;`, the overlay renders both undo actions and global system notifications (`ToastService`) strictly on top of all modal dialogs, CDK overlays, and backdrop blur layers. Hovering over the toast pauses the timer and progress bar, resuming smoothly upon mouse leave.
  - **Responsive AppShell & Animated Mobile Hamburger Menu**: Responsive glass navbar that compresses navigation links into a smooth animated hamburger toggle and sliding frosted-glass navigation drawer on mobile screens (`<= 768px`). The household switcher is moved cleanly into the mobile drawer, with edge-to-edge compact padding and margins.
  - **Continuous Background Auth Refresh & Session Resilience**: Transparent `authInterceptor` retrying failed requests via silent `/api/auth/refresh`, proactive background token renewal on tab focus/visibility change, periodic session pings, and a dedicated CDK Dialog modal prompt on session expiration.
  - Visual product photo thumbnails on all pantry cards and catalogs without destructive discard controls.
  - Customizable filters by product category, storage location, and stock status with savable 1-click filter presets.
  - Unsaved modifications protection: closing any dirty modal triggers a confirmation dialog (`ConfirmModalComponent`) preventing accidental data loss, cleanly rendered without redundant divider lines.
- **Smart Multi-List Shopping**:
  - Support for multiple shopping lists, each optionally associated with a specific store.
  - Supermarket walking routes sorted by store-specific aisle order (`aisle` and `aisleOrder`).
  - Dedicated CDK Dialog for adding and editing items:
    - Real-time catalog search with reactive signal tracking, immediately suggesting candidate products when empty.
    - In-place item editing: direct edit button on shopping items opening the modal pre-filled to modify quantity, store, and notes.
    - Live product preview: main photo thumbnail, current in-pantry stock, and earliest expiration date.
    - Quantity selector, store assignment, and multiline instructions/notes.
    - Uncataloged custom product support for ad-hoc shopping items without catalog linkage.
  - Automated missing item replenishment with one-click dialog to add items below minimum stock thresholds (respecting `treatOpenedAsOutOfStock`).
  - Non-destructive "Done" toggle that strikes through completed cart items without removing them or altering pantry stock.
- **Product Catalog, Hierarchy & Expiration Policies**:
  - Infinite recursive parent-child nesting (e.g. `Produce` &rarr; `Fresh Fruit` &rarr; `Citrus` &rarr; `Oranges` &rarr; `Tarocco`) with automatic aggregated stock roll-up across sub-trees.
  - Responsive catalog pagination (24 products per page) with full URL query parameter synchronization (`q`, `group`, `status`, `page`), real-time search across names, barcodes, descriptions, and hierarchy paths, and status filtering (`All`, `Active Only`, `Inactive (Archived)`).
  - HTML description rendering: product descriptions are displayed with sanitized HTML support.
  - Modular product editor dialog (`min(840px, 94vw)` locked width, vertical scrolling):
    - **Basic Information**: product name, multiline HTML description, category, `cannotBeFrozen` constraint checkbox, `active` / inactive archive toggle, and parent product text input with autocomplete suggestions (`AutocompleteDirective` with dynamic input-relative attachment directly below the input, keyboard arrow navigation, and default option listing) and validation error feedback.
    - **Photos & Media**: multi-photo upload, Drag & Drop visual reordering with tight 6-dot grip handles (`@angular/cdk/drag-drop`), primary image badge, and individual deletion.
    - **Locations & Default Store**: default storage location, open location (`openLocationId`), `moveOnOpen` relocation toggle, and default supermarket.
    - **Expiration Policies**: due date type (`best_before` vs `use_by`), shelf life days on purchase, days after opening, days after freezing, and days after thawing.
    - **Quantity Rules**: minimum pantry threshold, unit of measure, and `treatOpenedAsOutOfStock` setting.
    - **Barcodes**: multiple EAN/UPC barcodes per product with chip management.
    - **Store Aisles & Prices**: multi-store aisle names, walking order numbers, and average purchase prices.
    - **Collapsible Sections**: standalone accordion component (`CollapsibleSectionComponent`) with smooth animated CSS grid row transitions.
    - **Optimistic In-Place Updates**: saving or updating products updates local state immediately without triggering full-page data reloads.
- **Multi-Tenant Household Architecture & Ownership**:
  - OpenID Connect (OIDC) authentication with Backend-for-Frontend (BFF) cookie security, enriched profile photo avatars from OIDC claims (with fallback initials in navigation header, mobile drawer, and home banner), and automated user provisioning.
  - Quick household switcher in the navigation bar with click-outside and escape-key auto-dismissal.
  - Strict household ownership: only household owners can rename or delete households (with CDK confirmation dialog); shared members have read/edit inventory permissions without destructive household actions.
  - Complete household management: create households, view members, send and manage email invitations.
- **Offline-First PWA Resilience & Navbar Sync Indicator**:
  - Fully functional offline via IndexedDB local storage (`cambusa_offline_v1`) and Cache-First Service Worker (`sw.js`).
  - Animated navbar sync indicator with dropdown menu displaying live connectivity, unpushed pending mutations counter, relative sync timestamps, force sync trigger, and a server-reset "Download from Server" rescue option via CDK dialog.
  - Bi-directional sync engine with Last-Write-Wins (LWW) conflict resolution and tombstone deletion reconciliation.
- **Grocy Migration Tool**:
  - Built-in migration CLI to import your existing Grocy SQLite database (`grocy.db`), multiple barcodes, attachments, and product pictures directly into your chosen Cambusa household, with automated `2999-12-31` sentinel date normalization to `null`.

---

## Technology Stack

- **Backend**: NestJS 12, TypeORM 1.1, `better-sqlite3` (WAL mode enabled, relational foreign key constraints enforced with CASCADE / SET NULL actions), `nodemailer` (SMTP digest delivery & inline CID attachments), `jose` (OIDC/PKCE), `sharp` (WebP image processing), Vitest.
- **Frontend**: Angular 22 (100% Standalone components strictly structured across 4 files: `.component.ts`, `.component.html`, `.component.scss`, `.component.spec.ts`), Angular Signals (`signal`, `computed`, `effect`, `model`), Angular CDK (`@angular/cdk/dialog`, `@angular/cdk/drag-drop`), Reusable Directives & Components (`appAutocomplete`, `CollapsibleSectionComponent`, `QuickDateModifierComponent`, `UndoToastComponent`), IndexedDB (`OfflineStorageService`), Service Worker (`sw.js`).
- **Container**: Unified multi-stage Docker container running Nginx and NestJS supervised by `supervisord`.

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 22+ (tested on v26)
- npm 11+

### Installation

```bash
# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### Running in Development

In the root directory:

```bash
# Optional: copy example environment configuration (defaults to cambusa.sqlite in repo root)
cp .env.example .env

# Start backend (NestJS dev server on http://localhost:3000)
npm run start:backend

# Start frontend (Angular dev server on http://localhost:4200)
npm run start:frontend
```

In local development, the backend automatically reads `.env` from the project root and places the SQLite database (`cambusa.sqlite`) and uploads directory (`uploads/`) directly in the monorepo root.

Open `http://localhost:4200` in your browser. The Angular dev proxy forwards `/api/*` requests to the backend at `http://localhost:3000`.

---

## Production Deployment (Docker Compose)

```bash
# Copy example environment configuration
cp .env.example .env

# Edit .env with your OIDC provider credentials and secret keys
# nano .env

# Build and start container
docker compose up -d
```

Cambusa is available on port `8080` (e.g. `http://localhost:8080`).

---

## Migrating from Grocy

Cambusa includes an automated migration CLI to import your existing Grocy SQLite database and product pictures into your chosen Cambusa household:

```bash
# Specify the Grocy source directory (mandatory):
npm run migrate:grocy -- FROM-GROCY

# With optional household or database overrides:
npm run migrate:grocy -- /path/to/grocy-backup --household-id <TARGET_HOUSEHOLD_UUID>
```

### Folder Structure
The specified folder must contain your Grocy database and product pictures in standard layout:
- **Database**: `<grocy-folder>/grocy.db` (or `<grocy-folder>/data/grocy.db`)
- **Product Pictures**: `<grocy-folder>/storage/productpictures` (or `<grocy-folder>/data/storage/productpictures`)

### What Gets Migrated
1. **Quantity Units & Product Groups**: All units and categories with plural names and active status.
2. **Storage Locations & Stores**: Pantries, refrigerators, freezers (`isFreezer`), and shopping locations.
3. **Products & Hierarchy**: Names, descriptions, minimum stock levels, default expiration days, preferred stores, and parent-product tree hierarchies.
4. **Product Barcodes**: Multi-barcode arrays extracted from `product_barcodes` and `products.barcode`.
5. **Product Pictures & Attachments**: Converted and optimized to WebP format (`1200x1200` max inside fit, 85% quality) and stored in `uploads/products/<UUID>.webp`.
6. **Userfields**: Yuka scores (`yuka_score`) and taste preference ratings (`tastes_good`).
7. **Stock Inventory**: In-stock items with quantities, best-before dates, purchase dates, prices, opened state, and notes.
8. **Shopping Lists & Items**: Multi-list shopping lists (with store assignments) and active shopping items mapped to their target lists.

---

## Documentation Suite

Detailed architecture specifications, entity models, and developer guides are available in the [`docs/`](file:///home/fsorge/projects/new-grocy/docs/) directory:

- [System Architecture](file:///home/fsorge/projects/new-grocy/docs/ARCHITECTURE.md) — High-level topology, BFF security, and PWA integration.
- [Data Model & Entities](file:///home/fsorge/projects/new-grocy/docs/DATA_MODEL.md) — Entity relationships, SQLite WAL configuration, and infinite product tree.
- [Authentication & Security](file:///home/fsorge/projects/new-grocy/docs/AUTHENTICATION.md) — OIDC PKCE flow, HttpOnly cookie storage, and tenant isolation guards.
- [Offline Sync & PWA Engine](file:///home/fsorge/projects/new-grocy/docs/OFFLINE_SYNC.md) — IndexedDB storage, sync protocol, LWW conflict resolution, and tombstones.
- [API Reference](file:///home/fsorge/projects/new-grocy/docs/API_REFERENCE.md) — Complete REST endpoint documentation and error payloads.
- [Deployment & DevOps](file:///home/fsorge/projects/new-grocy/docs/DEPLOYMENT_AND_DEVOPS.md) — Docker multi-stage builds, Supervisor, Nginx proxy, and GitHub Actions CI/CD.

---

## License

This project is licensed under the AGPL-3.0-or-later License.
