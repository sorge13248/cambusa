# Cambusa

<p align="center">
  <img src="frontend/public/icon.webp" alt="Cambusa Logo" width="120" height="120" />
</p>

<p align="center">
  <strong>The private-first, self-hostable home pantry, grocery manager, and meal companion.</strong><br>
  <em>Designed for families, food enthusiasts, and smart homes — fully offline-first with zero telemetry.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License: AGPL-3.0" /></a>
  <a href="https://angular.dev"><img src="https://img.shields.io/badge/frontend-Angular%2022-DD0031.svg" alt="Angular 22" /></a>
  <a href="https://nestjs.com"><img src="https://img.shields.io/badge/backend-NestJS%2012-E0234E.svg" alt="NestJS 12" /></a>
  <a href="docs/OFFLINE_SYNC.md"><img src="https://img.shields.io/badge/architecture-Offline--First%20PWA-10b981.svg" alt="Offline-First PWA" /></a>
  <a href="https://www.docker.com"><img src="https://img.shields.io/badge/deployment-Docker-2496ED.svg" alt="Docker Ready" /></a>
</p>

<p align="center">
  <img src="docs/assets/cambusa-pantry-firefox-kde.png" alt="Cambusa Pantry Inventory in Firefox on KDE Breeze" width="100%" />
</p>

## Why Cambusa?

Food waste is costly and frustrating, grocery planning across family members can be chaotic, and most home inventory tools are either clunky spreadsheets or cloud services that monetize your personal data.

**Cambusa** (Italian for the galley or ship's pantry) is built to make food management effortless, reliable, and visually delightful:

- 🥑 **Never Let Food Go to Waste**: Clear, color-coded expiration timelines ensure you consume what is due first.
- 🛒 **Shop in Record Time**: Multi-store shopping lists automatically sorted by the real walking aisle order of your local supermarket.
- 📶 **Works Everywhere (Even With Zero Signal)**: Take your shopping list into supermarket basements without losing connectivity. Cambusa is an offline-first Progressive Web App (PWA) that syncs seamlessly when you're back online.
- 🏡 **Built for Households**: Switch between multiple households (home, vacation cabin, shared space) with individual member access and privacy-first single sign-on.
- 🍲 **Connected to Your Kitchen**: Seamlessly integrates with **Mealie** for recipe discovery based on on-hand ingredients, and **Home Assistant** for smart kitchen dashboards and e-ink displays.
- ⚡ **Accident-Proof**: Made a mistake while logging purchases or consumption? Every action features a 10-second instant undo.

## Highlights & Features

### 📦 Smart Pantry & Expiration Tracking
- **Expiration-First Priority**: Inventory is automatically ordered by best-before and use-by dates, with vivid urgency badges highlighting what needs attention.
- **Single-Tap Quick Date Adjustments**: Postpone or adjust due dates on the fly with fast date chips (`Today`, `Tomorrow`, `+2d`, `+7d`).
- **Batch & Location Control**: Group inventory into unified product cards while tracking distinct batches across pantries, refrigerators, and freezers. Active catalog products currently out of stock are also displayed at reduced opacity with a red `Out of stock` badge so you can quickly restock them directly from the Pantry view.
- **Freezer Protection**: Guard items with freezer-safety constraints (`cannotBeFrozen`), preventing assignment or movement to freezer locations, filtering out freezer storage options across purchase, move, and edit dialogs, automatically nullifying freeze/thaw shelf life fields on the database, and recalculating expiration dates upon freezing and thawing for freezable goods.
- **Accurate Actions & Batch Splitting**: Easily record items as **Consumed** (with spoiled waste tracking), **Open 1** (splitting individual units from multi-item batches to track opened shelf life with 10-second undo reversal), **Purchased** (with price and store details), or **Moved** between rooms using parameterizable `NumberStepperComponent` controls.
- **Quick Pantry Actions Footer (Quick Consume & Quick Purchase)**: Fixed bottom-centered toolbar across Home, Pantry, and Products views. "Quick Purchase" enables high-speed continuous barcode scanning and immediate inventory addition; when scanning an unrecognized barcode, selecting a product from the autocomplete prompts whether to save that barcode to the selected product. "Quick Consume" scans barcodes, selects the earliest-expiring batch, and displays a confirmation dialog with an auto-approving countdown timer (default 10s, configurable in profile) to consume the batch (featuring a dedicated "Mark as Open" button to open the item immediately without waiting for the timer) before returning directly to camera scanning for the next item.
- **Universal Floating Action Buttons (FAB)**: Rapid one-thumb access to "+ Add Item" (Pantry and Shopping), "+ Add Product" (Catalog), and "Save View" via bottom-right floating action buttons across desktop and mobile, automatically elevated when the quick actions toolbar is active.
- **Dynamic Route Titles**: Every application view dynamically synchronizes the browser tab title (`<Page Name> — Cambusa`) through a centralized `CambusaTitleStrategy`.
- **Instant Search & Filters**: Search catalog names and descriptions in real time, filter by category or storage location, and save your favorite view presets.
- **Lucide Vector Iconography**: Crisp, theme-aligned vector icons from `@lucide/angular` replacing generic system emojis across navigation, dialogs, buttons, and status indicators.
- **Mobile-Optimized Experience**: Full-screen square-edge modals on mobile with unified secondary-styled close buttons matching modal header action buttons, responsive store aisle card layout, barcode scan icon-only controls on mobile viewports, centered confirmation dialogs, and two-column shopping card metadata.

### 🛒 Intelligent Supermarket Shopping Lists
- **Default Shopping List Support**: Designate a primary default shopping list (`isDefault`) that automatically opens when visiting the shopping page without requiring manual list selection.
- **Store-Aware Walking Order**: Organize your shopping items by actual aisle sequences (`Produce` &rarr; `Bakery` &rarr; `Dairy`), eliminating zig-zagging through the store.
- **Store-Tied Aisle Section Grouping**: Automatically groups list items under aisle headers strictly for the store associated with the active shopping list. If a shopping list is not associated with any store, store aisles are never used and items are organized cleanly under general item groups. When a list is associated with a store, an "Unspecified Aisle" section appears only for items lacking an aisle assignment in that specific store.
- **Two-Column Card Layout with Inline Notes**: Shopping cards display item quantities and notes inline alongside product names, with a full-width bottom section presenting aisle badges and current pantry stock counts in two clean columns.
- **Safe Item Deletion**: Deleting items from any shopping list requires explicit user confirmation via an alert dialog before removal.
- **Custom Drag & Drop Reordering (Offline-First)**: Reorder shopping list tabs and individual list items with CDK drag-and-drop and custom visual placeholders. List sequences save instantly to local storage and IndexedDB before syncing to the backend.
- **Wrapped Multi-List Navigation**: Multi-list tabs cleanly wrap onto multiple lines without horizontal overflow scrolling, maintaining full visibility across desktop and mobile screens.
- **URL Query Parameter Routing**: Switching lists updates the browser URL (`?list=<id>`), with full support for browser Back, Forward, and Page Reload.
- **Product Info Modal & Per-User Star Ratings**: View full product details, expiration rules, barcodes, store aisles, and Mealie links in a read-only info modal (with an in-place switch to edit mode) accessible from the Products catalog, Pantry, Relations, and Shopping List. Rate products from 1 to 5 stars independently per user (with an explicit Clear button), and view other household members' ratings and profile avatars in shared households.
- **Direct Catalog Product Inspection & Editing**: Inspect product details, ratings, parent products, and store mappings directly from shopping list items with single-click modal access and in-place editing.
- **Multi-List Flexibility**: Maintain distinct lists for different stores (e.g. Weekly Supermarket, Farmer's Market, Wholesale Club, Pharmacy) rendered as reusable tabs.
- **One-Click Low-Stock Restocking**: Instantly restock items that have dropped below your configured pantry thresholds.
- **Non-Destructive Cart Check-Off**: Checking off an item marks it completed without deleting it from your list or altering inventory until you choose to restock.
- **Uncataloged Quick Items**: Add ad-hoc shopping items on the fly without having to set up formal catalog entries beforehand.

### 🍲 Kitchen, Meal Planner & Smart Home Integrations
- **Weekly Meal Planner (`/planner`)**: Interactive weekly calendar organized into five daily meal slots (**Breakfast**, **Morning Snack**, **Lunch**, **Afternoon Snack**, **Dinner**). Each planned item records the household member who added it (displaying their profile avatar), total pantry stock, earliest expiration date, and direct **Open 1** / **Consume 1** actions with 10-second undo support. On desktop browsers (`hover: hover` & `pointer: fine`), planned items can be dragged and dropped across different days and meal slots, and right-clicking any item opens a custom CDK context menu for instant deletion with 10-second undo recovery. Selecting foods reuses the full Pantry inventory search, filter, and 4-column grid component inside a wide picker modal.
- **Mealie Recipe Companion**: Connect your [Mealie](https://mealie.io) recipe manager to discover recipes you can cook right now with what is currently in stock. Open recipes with mapped ingredients directly in a single click.
- **Next Engine Feed (`/api/next`)**: A dedicated high-performance JSON endpoint built for external integrations, Home Assistant sensor dashboards, and kitchen e-ink displays.
- **Daily Morning Email Digest**: Wake up to a streamlined, high-deliverability graphical summary of food expiring soon, complete with inline product photos, colorful expiration status badges, and direct dashboard links formatted cleanly for native light and dark mode email clients without forced dark backgrounds.
- **Developer API Keys**: Generate secure, revocable 256-bit API keys directly from your profile to build your own scripts and automations.

### ⚡ Accident-Proof 10-Second Undo
- Tapped "Consume", "Purchased", or "Delete Product" by mistake? Cambusa gives you a persistent 10-second countdown toast on inventory, meal planner, and product deletion actions.
- A single click reverses the entire operation cleanly without manual database corrections, preserving product photo attachments on the filesystem during the 10-second window and instantly restoring state without network requests.

### 📶 Offline-First PWA Resilience & Local Mutation Pipeline
- Built from the ground up as a pure offline-first Progressive Web Application: all user mutations across inventory, shopping lists, and products write directly to IndexedDB before background synchronization, eliminating direct REST mutation calls.
- Works seamlessly offline via client-side IndexedDB storage (`cambusa_offline_v1`), SPA navigation fallback, and Stale-While-Revalidate Service Worker caching.
- Optimistic dashboard updates modify UI state in-place with zero loading flicker or API overhead.
- Automated version check with interactive update modal prompting users to reload when a new release is available, alongside a persistent topbar update badge.
- Transparent bi-directional synchronization via `POST /api/sync` with Last-Write-Wins (LWW) conflict resolution and tombstone deletion tracking once your device reconnects.

### 📷 In-Browser Barcode & QR Code Scanner
- **Direct Web-Embedded Viewfinder**: Scans barcodes and QR codes directly within the web page via WebRTC, bypassing external OS camera apps or file chooser popups.
- **Hardware-Accelerated Dual Detection Engine**: Combines the high-performance native `BarcodeDetector` API (with zero CPU overhead on modern Chromium and iOS 17+ Safari) with pure JavaScript ZXing fallback for 100% cross-browser reliability, including multi-orientation decoding across all 4 cardinal angles (0°, 90°, 180°, and 270°) with full-resolution offscreen transformations.
- **Adaptive Camera Flipping**: Toggle between outer/rear and inner/front cameras on multi-camera devices, with automatic hiding on single-camera hardware such as laptops.
- **Hardware-Aware Flashlight / Torch Control**: One-touch illumination control for dimly-lit pantries, automatically displayed only when hardware torch capability is supported.
- **Embedded Everywhere**: Integrated into product catalog editing (adding multiple EAN/UPC barcodes), pantry stocking, and shopping list searches with auto-closing on detection and subtle audio/haptic feedback.

### 🎨 Modern Aero Glass Interface
- Built with a frosted glass aesthetic, featuring smooth backdrop blurs and floating navigation islands.
- Automatic OS-native Dark and Light mode adaptation (`prefers-color-scheme`).
- Fully responsive across desktop, tablet, and mobile screens with compressed touch layouts, quick icon navigation bar for immediate page access on mobile, and a dedicated expandable full drawer menu.
- Modular user profile architecture organizing identity, expirations, Mealie recipes, email notifications, API keys, and domains into dedicated subpages.

### 🔄 Easy Grocy Migration
- Moving from Grocy? Cambusa includes a dedicated CLI migration tool that imports your products, barcodes, storage locations, product pictures, stock items, and shopping lists in seconds.

## Quick Start

### 1. Production Deployment (Docker Compose)

The easiest way to run Cambusa is using Docker Compose:

```bash
# Clone the repository
git clone https://github.com/your-username/cambusa.git
cd cambusa

# Copy the example environment configuration
cp .env.example .env

# Edit .env with your session secrets and OIDC provider details
# nano .env

# Launch the unified container
docker compose up -d
```

Cambusa will be accessible at `http://localhost:8080`.

### 2. Local Development

#### Prerequisites
- **Node.js**: v22+ (v26 recommended)
- **npm**: v11+

#### Setup & Execution

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ..

# 2. Configure environment
cp .env.example .env

# 3. Start development servers
npm run start:backend   # NestJS API running on http://localhost:3000
npm run start:frontend  # Angular SPA running on http://localhost:4200
```

Open `http://localhost:4200` in your browser. The Angular dev server automatically proxies `/api/*` calls to the NestJS backend.

## Grocy Data Migration

If you are migrating from an existing Grocy installation, run the automated migration command:

```bash
# Specify the path to your Grocy backup directory containing grocy.db and product pictures:
npm run migrate:grocy -- /path/to/grocy-backup

# Optional: target a specific household UUID
npm run migrate:grocy -- /path/to/grocy-backup --household-id <TARGET_HOUSEHOLD_UUID>
```

The migration tool automatically:
- Converts and optimizes all product pictures to WebP format (`1200x1200` max inside fit, 85% quality).
- Imports quantity units, categories, storage locations, stores, and parent-child product trees.
- Normalizes Grocy sentinel dates (e.g. `2999-12-31`) to standard `null` dates.
- Migrates existing stock batches and active shopping lists.

## Technical Documentation Suite

For comprehensive deep dives into Cambusa's architecture, data model, security implementation, and APIs, refer to the technical guides in [`docs/`](docs/):

| Document | Focus & Highlights |
| :--- | :--- |
| **[System Architecture](docs/ARCHITECTURE.md)** | High-level topology, BFF pattern, Aero Glass design system, Mealie and email architecture, component structure. |
| **[Data Model & Database](docs/DATA_MODEL.md)** | TypeORM schema, SQLite WAL pragmas, infinite parent-child product hierarchy, cascading relations. |
| **[Authentication & Security](docs/AUTHENTICATION.md)** | OpenID Connect (OIDC) PKCE flow, HttpOnly cookie security, household tenant isolation guards. |
| **[Offline Synchronization](docs/OFFLINE_SYNC.md)** | IndexedDB client storage, Service Worker caching, Last-Write-Wins (LWW) conflict resolution, tombstones. |
| **[API Reference](docs/API_REFERENCE.md)** | Complete REST endpoint specifications, request/response schemas, `/api/next` engine parameters. |
| **[Deployment & DevOps](docs/DEPLOYMENT_AND_DEVOPS.md)** | Unified Docker container, Nginx reverse proxy, Supervisor process manager, multi-arch CI/CD. |

## Technology Stack

- **Frontend**: [Angular 22](https://angular.dev) (100% Standalone Components, Angular Signals, Angular CDK Dialog & Drag-Drop), IndexedDB, Service Worker.
- **Backend**: [NestJS 12](https://nestjs.com), [TypeORM 1.1](https://typeorm.io), `better-sqlite3` (WAL mode enabled), `sharp` (WebP image processing), `nodemailer`, `jose`.
- **Infrastructure**: Single-container multi-stage build running Nginx reverse proxy and NestJS supervised by `supervisord`.

## License

This project is licensed under the **AGPL-3.0-or-later** License. See the [LICENSE](LICENSE) file for details.
