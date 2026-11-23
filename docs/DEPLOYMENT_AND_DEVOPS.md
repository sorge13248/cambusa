# Deployment & DevOps Guide — Cambusa

Cambusa is packaged as a unified, self-contained Docker container combining Nginx, the NestJS backend, and the Angular standalone PWA into a single deployable image managed by `supervisord`.

---

## 1. Unified Container Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Cambusa Unified Container                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    supervisord                        │  │
│  │                 (Process Manager)                     │  │
│  └───────────────┬───────────────────────┬───────────────┘  │
│                  │                       │                  │
│                  ▼                       ▼                  │
│  ┌───────────────────────────┐  ┌────────────────────────┐  │
│  │           Nginx           │  │      NestJS App        │  │
│  │        Port 80/443        │  │    127.0.0.1:3000      │  │
│  │                           │  │                        │  │
│  │ • / → Static Angular PWA  │  │ • /api/* API & Sync    │  │
│  │ • /uploads/* → Media files│  │ • SQLite WAL Engine    │  │
│  │ • /api/* → Proxy to NestJS│  │                        │  │
│  └───────────────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Docker Compose Quickstart

Deploy Cambusa using the included `docker-compose.yml`:

```yaml
services:
  cambusa:
    image: ghcr.io/fsorge/cambusa:latest
    container_name: cambusa
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/data/cambusa.sqlite
      - UPLOADS_DIR=/data/uploads
      - COOKIE_SECRET=replace_with_a_secure_random_64_char_string
      - OIDC_ISSUER_URL=https://auth.example.com
      - OIDC_CLIENT_ID=cambusa
      - OIDC_CLIENT_SECRET=your_oidc_client_secret
      - BASE_URL=https://cambusa.example.com
    volumes:
      - cambusa-data:/data

volumes:
  cambusa-data:
```

### Launch Container
```bash
docker compose up -d
```

---

## 3. Environment Variables Reference

| Variable | Default | Required | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `production` | No | Application environment (`production` or `development`) |
| `PORT` | `3000` | No | Internal backend port bound to `127.0.0.1` |
| `DB_PATH` | `cambusa.sqlite` | No | Path to SQLite database file. In Docker, set to an absolute path (e.g. `/app/data/cambusa.sqlite`). In local development, resolves relative to repository root (`<root>/cambusa.sqlite`) |
| `UPLOADS_DIR` | `uploads` | No | Directory storing optimized WebP product pictures. In Docker, set to an absolute path (e.g. `/app/data/uploads`). In local development, resolves relative to repository root (`<root>/uploads`) |
| `COOKIE_SECRET` | — | Yes | 64-character secret for encrypting PKCE & auth cookies |
| `BASE_URL` | `http://localhost:8080`| Yes | Public base URL of the Cambusa instance |
| `OIDC_ISSUER_URL` | — | No | OIDC Discovery URL (e.g. `https://auth.example.com`) |
| `OIDC_CLIENT_ID` | — | No | OIDC client ID |
| `OIDC_CLIENT_SECRET`| — | No | OIDC client secret |

> [!NOTE]
> If `OIDC_ISSUER_URL` is omitted, Cambusa automatically activates Developer Mock Authentication (`system-dev-user`), enabling out-of-the-box local testing.

---

## 4. Multi-Stage Dockerfile Overview

The production `Dockerfile` uses a 3-stage build:

1. **Stage 1 (Frontend Build)**:
   - Node 22+ base image.
   - Installs frontend dependencies and executes `ng build` targeting production output in `/app/frontend/dist/frontend/browser`.
2. **Stage 2 (Backend Build)**:
   - Compiles TypeScript NestJS backend using `nest build`.
   - Prunes devDependencies and retains native SQLite bindings (`better-sqlite3`, `sharp`).
3. **Stage 3 (Unified Runtime)**:
   - Debian-based `node:slim` base image with Nginx and Supervisor.
   - Combines the compiled frontend into `/usr/share/nginx/html` and backend into `/app/backend/dist` (with `/app/backend/node_modules`).
   - Runs `supervisord` daemon orchestrating both Nginx and the NestJS backend (`node /app/backend/dist/main`).

---

## 5. CI/CD Pipelines (GitHub Actions)

### 5.1 Multi-Architecture Container Workflow (`.github/workflows/docker-multiarch.yml`)
- Triggered on tag push (`v*.*.*`) and pull requests to `main`.
- Sets up QEMU and Docker Buildx.
- Compiles and pushes multi-architecture images to GitHub Container Registry (`ghcr.io`):
  - `linux/amd64` (standard x86 servers)
  - `linux/arm64` (Raspberry Pi 4/5, Apple Silicon, AWS Graviton)

### 5.2 Release Automation (`.github/workflows/release.yml`)
- Automatically generates GitHub Releases on semver tags.
- Publishes pre-built artifact tarballs and container digest signatures.

---

## 6. Maintenance & Backups

Because SQLite operates in WAL mode (`better-sqlite3`), copying the active `.sqlite` file directly during heavy writes can produce an inconsistent snapshot. Always use the SQLite online backup API or CLI tool:

### Safe Backup Command
```bash
docker exec cambusa sqlite3 /data/cambusa.sqlite ".backup /data/cambusa-backup-$(date +%Y%m%d%H%M%S).sqlite"
```

### Media Backup
Back up the `/data/uploads` directory containing product WebP pictures:
```bash
docker run --rm -v cambusa-data:/data -v $(pwd):/backup alpine tar czf /backup/uploads-backup.tar.gz /data/uploads
```

---

## 7. Grocy Data Migration CLI

The migration CLI imports legacy Grocy data directly into Cambusa by specifying the Grocy source directory.

### Mandatory Folder Argument
The migration command always requires passing the directory containing your Grocy installation files:
- Database: `<grocy-folder>/grocy.db` (or `<grocy-folder>/data/grocy.db`)
- Product Pictures: `<grocy-folder>/storage/productpictures` (or `<grocy-folder>/data/storage/productpictures`)

```bash
# Execute migration by specifying the source folder (mandatory)
npm run migrate:grocy -- FROM-GROCY

# With optional target household or database paths
npm run migrate:grocy -- /path/to/grocy-data \
  --household-id <TARGET_HOUSEHOLD_UUID> \
  --cambusa-db /path/to/cambusa.sqlite \
  --uploads-dir /path/to/uploads
```

All product images are automatically converted and resized to compressed WebP (`1200x1200` max inside fit, 85% quality) and stored in `<uploadsDir>/products/<product-uuid>.webp`. Units, product groups, storage locations, stores, product trees, barcodes, stock inventory, userfields, and shopping lists are completely migrated with full tenant isolation.
