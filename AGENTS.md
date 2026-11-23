# AGENTS.md — AI Agent Operating Instructions for Cambusa

> **CRITICAL DIRECTIVE**: Every AI agent operating in this repository MUST read and adhere to these guidelines before executing any changes, code modifications, or refactoring.

---

## 1. Absolute Priority: In-Place Documentation Maintenance

Whenever **ANY** modification is made to the software (including features, architectural adjustments, API endpoints, database entities, UI components, configurations, tools, scripts, or workflows):

1. **Mandatory Documentation Scope**:
   - `README.md` (English primary portal)
   - Relevant technical documentation files in `docs/` (`ARCHITECTURE.md`, `DATA_MODEL.md`, `AUTHENTICATION.md`, `OFFLINE_SYNC.md`, `API_REFERENCE.md`, `DEPLOYMENT_AND_DEVOPS.md`)
2. **STRICT FORMAT CONSTRAINT (Non-negotiable)**:
   - **DO NOT** document modifications as a "changelog", "recent changes", "history", "release notes", or list of changes made.
   - **DO** directly modify and update the existing descriptions, architecture diagrams, data models, tables, endpoints, and specifications in place.
   - The documentation must always read as the **current, single source of truth** representing the active state of the application.
3. **STRICT LANGUAGE DIRECTIVE**:
   - All code, variable names, comments, commit messages, user interfaces, error messages, and documentation files must be **100% in English**. No Italian or other languages are permitted.

---

## 2. Project Overview & Monorepo Architecture

**Cambusa** is a private-first, self-hostable home pantry, grocery management, and meal planning system with offline-first PWA resilience and bi-directional synchronization.

- **Backend**: NestJS 12, TypeORM 1.1 with `better-sqlite3` (WAL mode enabled), `sharp` for image processing (WebP), `jose` for OIDC/PKCE verification.
- **Frontend**: Angular 22 standalone components (no `NgModule`), Angular Signals (`signal`, `computed`, `effect`), IndexedDB (`OfflineStorageService`), custom Service Worker (`sw.js`).
- **Container**: Unified multi-stage Docker container running Nginx and NestJS managed by `supervisord`.

### Directory Map
```text
/
├── backend/                  # NestJS API, TypeORM entities, services, controllers, seed
│   ├── src/
│   │   ├── common/           # Auth guards, household guards, decorators, sync types
│   │   ├── controllers/      # REST API controllers (auth, households, products, stock, shopping, sync)
│   │   ├── database/         # Database dataSource, WAL pragmas, seed & Grocy migration script
│   │   ├── entities/         # TypeORM entity definitions
│   │   ├── modules/          # NestJS feature modules
│   │   └── services/         # Domain services, sync engine, image processor
│   └── package.json
├── frontend/                 # Angular 22 Single-Page Application (PWA)
│   ├── src/app/
│   │   ├── core/             # Services: api, auth, household, sync, offline-storage
│   │   ├── features/         # Features: pantry, shopping, products, households, stores, auth
│   │   ├── layout/           # AppShell with Household switcher dropdown & navigation header
│   │   └── shared/           # Reusable UI components (modals, dropdowns, buttons, badges)
│   ├── public/               # Static assets, manifest.webmanifest, and sw.js
│   └── package.json
├── deploy/                   # Container configurations (supervisord.conf, nginx.unified.conf)
├── docs/                     # Comprehensive technical documentation suite (English only)
├── .github/workflows/        # CI/CD pipelines (docker-multiarch.yml, release.yml)
├── Dockerfile                # Multi-stage production container
├── docker-compose.yml        # Production compose definition
├── AGENTS.md                 # Universal AI Agent guidelines (this file)
└── README.md                 # Primary English documentation portal
```

---

## 3. Core Architectural Invariants (Never Violate)

1. **Strict Tenant Isolation by `householdId`**:
   - Every domain query and mutation across `Product`, `StockItem`, `ShoppingList`, `ShoppingListItem`, `Store`, `ProductStore`, `SavedFilter`, and `SyncTombstone` MUST explicitly filter by `where: { householdId: activeHouseholdId }`.
   - Authenticated users access only households in which they are registered members via `HouseholdMember`.

2. **Backend-for-Frontend (BFF) Security Pattern**:
   - Never store access, refresh, or ID tokens in `localStorage`, `sessionStorage`, or JavaScript memory.
   - All browser HTTP requests must use credential forwarding (`credentials: 'include'`).
   - Authenticated endpoints must use `@UseGuards(BearerJwtGuard, HouseholdMemberGuard)` and retrieve user claims with `@CurrentUser() user: AuthUser`.

3. **Infinite Hierarchical Parent Products**:
   - Products support arbitrary nesting depth via self-referencing `@ManyToOne` and `@OneToMany` parent-product relations (`parentProductId`).
   - Cyclic parent hierarchies are strictly prohibited.

4. **Shopping List "Done" Non-Destructive Behavior**:
   - Toggling the "Done" state on a shopping list item marks it completed (visually struck-through) and preserves it in the list.
   - Marking an item "Done" MUST NEVER create stock records or alter pantry inventory.

5. **Mandatory Tombstone Tracking for Deletions**:
   - Whenever an entity is deleted (`Product`, `StockItem`, `ShoppingListItem`, `Store`, etc.), a corresponding record MUST be written to `SyncTombstone` with `householdId`, `entityType`, `entityId`, and `deletedAt`. Without tombstones, offline clients cannot reconcile deletions.

6. **100% Standalone Angular Components & Signals**:
   - Never use `NgModule`. All Angular components, pipes, and directives must be `standalone: true`.
   - Use Angular Signals (`signal()`, `computed()`, `effect()`) for reactive state management.

7. **Strict 4-File Angular Component Structure**:
   - Every Angular component MUST be structured across 4 dedicated files: `<name>.component.ts`, `<name>.component.html`, `<name>.component.scss`, and `<name>.component.spec.ts`. Inline templates or inline styles are prohibited.

8. **10-Second Reversible Stock Mutations**:
   - All stock inventory alterations (consume, purchase, move, quick expiration adjustments) MUST register an inverse compensation closure with `UndoService` to provide a persistent 10-second undo window via `UndoToastComponent`.

---

## 4. Verification and Test Protocol

Before finalizing any task, run the appropriate validation commands:

| Scope | Command | Purpose |
| :--- | :--- | :--- |
| **All Tests** | `npm run test` | Executes both frontend and backend test suites |
| **Frontend Tests** | `npm --prefix frontend run test` | Vitest headless execution in JSDOM |
| **Backend Tests** | `npm --prefix backend run test` | Backend unit & sync tests |
| **Linting** | `npm run lint` | Linter verification |
| **Build** | `npm run build` | Verifies full production build of frontend and backend |

---

## 5. Agent Workflow Checklist

When performing work on this codebase, follow this sequence:

1. [ ] **Analyze**: Inspect existing code, entities, and relevant files in `docs/`.
2. [ ] **Implement**: Write minimal, clean, type-safe code upholding the invariants in Section 3 in 100% English.
3. [ ] **Verify**: Run lint, tests, and build commands. Fix any regressions immediately.
4. [ ] **Update Documentation In-Place**: Directly update `README.md` and affected `docs/*.md` files to reflect the new software state. **Do not add a changelog section.**
