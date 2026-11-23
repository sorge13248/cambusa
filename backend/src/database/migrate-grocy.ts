import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { resolveDatabasePath, resolveUploadsDir as resolveGlobalUploadsDir } from '../load-env.js';
import {
  Household,
  HouseholdMember,
  HouseholdInvitation,
  Location,
  Product,
  ProductGroup,
  ProductStore,
  QuantityUnit,
  SavedFilter,
  ShoppingList,
  ShoppingListItem,
  StockItem,
  Store,
  SyncTombstone,
  User,
} from '../entities/index.js';

export interface MigrationOptions {
  grocyDir: string;
  householdId?: string;
  cambusaDb?: string;
  uploadsDir?: string;
}

export function printHelp(): void {
  console.log(`
Cambusa Grocy Migration Tool
----------------------------
Imports an existing Grocy SQLite database and product pictures into Cambusa.

Usage:
  npm run migrate:grocy <grocy-folder> [options]

Required:
  <grocy-folder>             Path to Grocy source folder (e.g. FROM-GROCY).
                             The folder must contain:
                             - grocy.db (or data/grocy.db)
                             - storage/productpictures (or data/storage/productpictures)

Options:
  --household-id <uuid>      Target Cambusa household UUID (defaults to first or creates 'Default Home')
  --cambusa-db <path>        Target Cambusa SQLite database (defaults to cambusa.sqlite)
  --uploads-dir <path>       Uploads directory (defaults to uploads)
  --help, -h                 Show this help message

Example:
  npm run migrate:grocy FROM-GROCY
`);
}

export function parseArgs(rawArgs: string[] = process.argv.slice(2)): MigrationOptions {
  let grocyDir: string | undefined;
  let householdId: string | undefined;
  let cambusaDb: string | undefined;
  let uploadsDir: string | undefined;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--household-id' && rawArgs[i + 1]) {
      householdId = rawArgs[++i];
    } else if (arg === '--cambusa-db' && rawArgs[i + 1]) {
      cambusaDb = rawArgs[++i];
    } else if (arg === '--uploads-dir' && rawArgs[i + 1]) {
      uploadsDir = rawArgs[++i];
    } else if ((arg === '--from-grocy' || arg === '--grocy-dir' || arg === '-d') && rawArgs[i + 1]) {
      grocyDir = rawArgs[++i];
    } else if (!arg.startsWith('-') && !grocyDir) {
      grocyDir = arg;
    }
  }

  if (!grocyDir) {
    console.error('Error: Grocy folder is required.');
    console.error('Usage: npm run migrate:grocy <grocy-folder> [options]');
    console.error('Example: npm run migrate:grocy FROM-GROCY\n');
    console.error('Run with --help for full usage instructions.');
    process.exit(1);
  }

  return { grocyDir, householdId, cambusaDb, uploadsDir };
}

export function resolveGrocyDb(grocyDir: string): string {
  const dir = resolve(grocyDir);
  if (!existsSync(dir)) {
    throw new Error(`Grocy folder not found: "${grocyDir}" (resolved to "${dir}")`);
  }
  if (!statSync(dir).isDirectory()) {
    throw new Error(`Specified path is not a directory: "${grocyDir}"`);
  }

  const candidates = [
    join(dir, 'grocy.db'),
    join(dir, 'data', 'grocy.db'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && !statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error(
    `Grocy database not found in "${grocyDir}".\n` +
    `Expected either:\n` +
    `  - ${join(grocyDir, 'grocy.db')}\n` +
    `  - ${join(grocyDir, 'data', 'grocy.db')}`,
  );
}

export function resolvePictureDirs(grocyDir: string): string[] {
  const dir = resolve(grocyDir);
  const possibleDirs: string[] = [];
  const candidates = [
    join(dir, 'storage', 'productpictures'),
    join(dir, 'data', 'storage', 'productpictures'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isDirectory() && !possibleDirs.includes(candidate)) {
      possibleDirs.push(candidate);
    }
  }

  return possibleDirs;
}

export function resolveCambusaDb(opts: Partial<MigrationOptions> = {}): string {
  if (opts.cambusaDb) return resolve(opts.cambusaDb);
  return resolveDatabasePath();
}

export function resolveUploadsDir(opts: Partial<MigrationOptions> = {}): string {
  if (opts.uploadsDir) return resolve(opts.uploadsDir);
  return resolveGlobalUploadsDir();
}

export async function runMigration(cliOpts?: MigrationOptions): Promise<void> {
  const opts = cliOpts ?? parseArgs();
  if (!opts.grocyDir) {
    throw new Error('Grocy folder is required.');
  }

  const grocyDbPath = resolveGrocyDb(opts.grocyDir);
  const possiblePicDirs = resolvePictureDirs(opts.grocyDir);
  const cambusaDbPath = resolveCambusaDb(opts);
  const uploadsDir = resolveUploadsDir(opts);

  console.log('--- Cambusa Grocy Migration ---');
  console.log(`Source Grocy Folder:  ${resolve(opts.grocyDir)}`);
  console.log(`Source Grocy DB:      ${grocyDbPath}`);
  if (possiblePicDirs.length > 0) {
    console.log(`Source Picture Dirs:  ${possiblePicDirs[0]}`);
    for (let i = 1; i < possiblePicDirs.length; i++) {
      console.log(`                      ${possiblePicDirs[i]}`);
    }
  } else {
    console.log('Source Picture Dirs:  (none found - product pictures will be skipped)');
  }
  console.log(`Target Cambusa DB:    ${cambusaDbPath}`);
  console.log(`Target Uploads Dir:   ${uploadsDir}`);

  // Ensure Cambusa schema is initialized
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: cambusaDbPath,
    entities: [
      User,
      Household,
      HouseholdMember,
      HouseholdInvitation,
      QuantityUnit,
      ProductGroup,
      Location,
      Store,
      Product,
      ProductStore,
      StockItem,
      ShoppingList,
      ShoppingListItem,
      SavedFilter,
      SyncTombstone,
    ],
    synchronize: true,
  });
  await ds.initialize();
  await ds.destroy();

  const grocy = new Database(grocyDbPath, { readonly: true });
  const cambusa = new Database(cambusaDbPath);

  cambusa.pragma('journal_mode = WAL');
  cambusa.pragma('synchronous = NORMAL');
  cambusa.pragma('foreign_keys = OFF'); // Bulk load with foreign keys deferred

  const nowIso = new Date().toISOString();

  // Ensure target household exists or find first
  let householdId = opts.householdId;
  if (!householdId) {
    const firstHh = cambusa.prepare('SELECT id, name FROM households LIMIT 1').get() as
      | { id: string; name: string }
      | undefined;
    if (firstHh) {
      householdId = firstHh.id;
      console.log(`Using existing household: "${firstHh.name}" (${householdId})`);
    } else {
      householdId = randomUUID();
      const firstUser = cambusa.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
      const ownerId = firstUser?.id ?? 'system';
      cambusa
        .prepare(
          `
        INSERT INTO households (id, name, ownerId, createdAt, updatedAt)
        VALUES (?, 'Default Home', ?, ?, ?)
      `,
        )
        .run(householdId, ownerId, nowIso, nowIso);

      if (firstUser) {
        cambusa
          .prepare(
            `
          INSERT INTO household_members (id, householdId, userId, role, createdAt)
          VALUES (?, ?, ?, 'owner', ?)
        `,
          )
          .run(randomUUID(), householdId, firstUser.id, nowIso);
      }
      console.log(`Created default household: "${householdId}"`);
    }
  }

  // 1. Quantity Units
  const unitMap = new Map<number | string, string>(); // grocyId -> cambusaUUID
  try {
    const grocyUnits = grocy.prepare('SELECT * FROM quantity_units').all() as any[];
    const insertUnit = cambusa.prepare(`
      INSERT INTO quantity_units (id, householdId, name, namePlural, description, active, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const u of grocyUnits) {
      const newId = randomUUID();
      unitMap.set(u.id, newId);
      insertUnit.run(
        newId,
        householdId,
        u.name,
        u.name_plural || u.name,
        u.description ?? null,
        u.active !== undefined ? (u.active ? 1 : 0) : 1,
        nowIso,
        nowIso,
      );
    }
    console.log(`✓ Migrated ${grocyUnits.length} quantity units.`);
  } catch (err: any) {
    console.warn(`! Quantity units note: ${err.message}`);
  }

  // 2. Product Groups
  const groupMap = new Map<number | string, string>();
  try {
    const grocyGroups = grocy.prepare('SELECT * FROM product_groups').all() as any[];
    const insertGroup = cambusa.prepare(`
      INSERT INTO product_groups (id, householdId, name, description, active, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const g of grocyGroups) {
      const newId = randomUUID();
      groupMap.set(g.id, newId);
      insertGroup.run(
        newId,
        householdId,
        g.name,
        g.description ?? null,
        g.active !== undefined ? (g.active ? 1 : 0) : 1,
        nowIso,
        nowIso,
      );
    }
    console.log(`✓ Migrated ${grocyGroups.length} product groups.`);
  } catch (err: any) {
    console.warn(`! Product groups note: ${err.message}`);
  }

  // 3. Locations
  const locationMap = new Map<number | string, string>();
  try {
    const grocyLocations = grocy.prepare('SELECT * FROM locations').all() as any[];
    const insertLocation = cambusa.prepare(`
      INSERT INTO locations (id, householdId, name, description, isFreezer, active, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const l of grocyLocations) {
      const newId = randomUUID();
      locationMap.set(l.id, newId);
      insertLocation.run(
        newId,
        householdId,
        l.name,
        l.description ?? null,
        l.is_freezer ? 1 : 0,
        l.active !== undefined ? (l.active ? 1 : 0) : 1,
        nowIso,
        nowIso,
      );
    }
    console.log(`✓ Migrated ${grocyLocations.length} storage locations.`);
  } catch (err: any) {
    console.warn(`! Locations note: ${err.message}`);
  }

  // 4. Shopping Locations / Stores
  const storeMap = new Map<number | string, string>();
  try {
    const grocyStores = grocy.prepare('SELECT * FROM shopping_locations').all() as any[];
    const insertStore = cambusa.prepare(`
      INSERT INTO stores (id, householdId, name, description, active, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of grocyStores) {
      const newId = randomUUID();
      storeMap.set(s.id, newId);
      insertStore.run(
        newId,
        householdId,
        s.name,
        s.description ?? null,
        s.active !== undefined ? (s.active ? 1 : 0) : 1,
        nowIso,
        nowIso,
      );
    }
    console.log(`✓ Migrated ${grocyStores.length} stores.`);
  } catch (err: any) {
    console.warn(`! Stores note: ${err.message}`);
  }

  // 5. Product Barcodes (from product_barcodes table)
  const barcodeMap = new Map<number | string, string[]>();
  try {
    const barcodes = grocy.prepare('SELECT product_id, barcode FROM product_barcodes ORDER BY id ASC').all() as any[];
    for (const b of barcodes) {
      if (b.barcode) {
        const val = String(b.barcode).trim();
        if (val) {
          const list = barcodeMap.get(b.product_id) ?? [];
          if (!list.includes(val)) list.push(val);
          barcodeMap.set(b.product_id, list);
        }
      }
    }
    const totalBarcodes = Array.from(barcodeMap.values()).reduce((acc, curr) => acc + curr.length, 0);
    console.log(`✓ Loaded ${totalBarcodes} barcodes across ${barcodeMap.size} products.`);
  } catch {
    // product_barcodes table might not exist in some setups
  }

  // Optional Product Files / Attachments (from product_files table)
  const attachmentsMap = new Map<number | string, string[]>();
  try {
    const files = grocy.prepare('SELECT product_id, file_name FROM product_files ORDER BY id ASC').all() as any[];
    for (const f of files) {
      if (f.file_name) {
        const fn = String(f.file_name).trim();
        if (fn) {
          const list = attachmentsMap.get(f.product_id) ?? [];
          if (!list.includes(fn)) list.push(fn);
          attachmentsMap.set(f.product_id, list);
        }
      }
    }
    const totalFiles = Array.from(attachmentsMap.values()).reduce((acc, curr) => acc + curr.length, 0);
    console.log(`✓ Loaded ${totalFiles} product files/attachments across ${attachmentsMap.size} products.`);
  } catch {
    // product_files table might not exist in some setups
  }

  // 6. Userfield values (e.g. yuka_score, tastes_good)
  const userfieldsByProduct = new Map<number | string, { yukaScore?: number; tastesGood?: boolean }>();
  try {
    const userfields = grocy
      .prepare(
        `
      SELECT uv.object_id, uf.name as field_name, uv.value
      FROM userfield_values uv
      JOIN userfields uf ON uv.field_id = uf.id
      WHERE uf.entity = 'products'
    `,
      )
      .all() as any[];

    for (const row of userfields) {
      const current = userfieldsByProduct.get(row.object_id) ?? {};
      if (row.field_name === 'yuka_score' && row.value) {
        const val = parseInt(row.value, 10);
        if (!isNaN(val)) current.yukaScore = val;
      } else if (row.field_name === 'tastes_good' && row.value !== undefined && row.value !== '') {
        const num = Number(row.value);
        if (!isNaN(num)) {
          current.tastesGood = num >= 3;
        } else {
          current.tastesGood = ['1', 'true', 'yes'].includes(String(row.value).toLowerCase());
        }
      }
      userfieldsByProduct.set(row.object_id, current);
    }
  } catch {
    // Userfield tables might be empty or missing in some setups
  }

  // 7. Products & Pictures
  const productMap = new Map<number | string, string>();
  let picturesMigrated = 0;
  const productsDir = join(uploadsDir, 'products');
  await mkdir(productsDir, { recursive: true });

  try {
    const grocyProducts = grocy.prepare('SELECT * FROM products').all() as any[];

    // Pass 1: Assign UUIDs to all products
    for (const p of grocyProducts) {
      productMap.set(p.id, randomUUID());
    }

    const insertProduct = cambusa.prepare(`
      INSERT INTO products (
        id, householdId, name, description, barcodes, pictureFileNames, cannotBeFrozen,
        openLocationId, moveOnOpen, defaultStoreId, dueType, defaultBestBeforeDays,
        defaultBestBeforeDaysAfterOpen, defaultBestBeforeDaysAfterFreezing, defaultBestBeforeDaysAfterThawing,
        minStockAmount, treatOpenedAsOutOfStock, productGroupId, defaultLocationId, quStockId, quPurchaseId,
        quFactor, yukaScore, tastesGood, parentProductId, active, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertProductStore = cambusa.prepare(`
      INSERT INTO product_stores (id, householdId, productId, storeId, aisle, aisleOrder, averagePrice, isPreferred, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, NULL, NULL, NULL, 1, ?, ?)
    `);

    for (const p of grocyProducts) {
      const newId = productMap.get(p.id)!;
      const extra = userfieldsByProduct.get(p.id);

      // Handle picture(s) & attachments
      const pictureFileNames: string[] = [];
      const candidateNames: string[] = [];
      if (p.picture_file_name) {
        let picName = String(p.picture_file_name).trim();
        if (picName.startsWith('b64:')) {
          try {
            picName = Buffer.from(picName.slice(4), 'base64').toString('utf-8');
          } catch {
            // Keep raw name on failure
          }
        }
        if (picName) candidateNames.push(picName);
      }
      const otherAttachments = attachmentsMap.get(p.id) ?? [];
      for (const att of otherAttachments) {
        if (!candidateNames.includes(att)) candidateNames.push(att);
      }

      for (const picName of candidateNames) {
        for (const picDir of possiblePicDirs) {
          if (!existsSync(picDir)) continue;
          const candidatePath = join(picDir, picName);
          if (existsSync(candidatePath) && !statSync(candidatePath).isDirectory()) {
            try {
              const fileBuffer = await readFile(candidatePath);
              const webpBuffer = await sharp(fileBuffer)
                .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 85 })
                .toBuffer();

              const destFileName = `${newId}-${pictureFileNames.length}.webp`;
              await writeFile(join(productsDir, destFileName), webpBuffer);
              pictureFileNames.push(destFileName);
              picturesMigrated++;
              break;
            } catch (err: any) {
              console.warn(`! Could not convert picture ${candidatePath}: ${err.message}`);
            }
          }
        }
      }

      // Handle barcodes
      const productBarcodes: string[] = [...(barcodeMap.get(p.id) ?? [])];
      if (p.barcode) {
        const directBarcode = String(p.barcode).trim();
        if (directBarcode && !productBarcodes.includes(directBarcode)) {
          productBarcodes.unshift(directBarcode);
        }
      }

      const parentId =
        p.parent_product_id && p.parent_product_id !== p.id ? productMap.get(p.parent_product_id) ?? null : null;
      const groupId = p.product_group_id ? groupMap.get(p.product_group_id) ?? null : null;
      const locId = p.location_id ? locationMap.get(p.location_id) ?? null : null;
      const quStock = p.qu_id_stock ? unitMap.get(p.qu_id_stock) ?? null : null;
      const quPurchase = p.qu_id_purchase ? unitMap.get(p.qu_id_purchase) ?? null : null;
      const defaultStoreId = p.shopping_location_id ? storeMap.get(p.shopping_location_id) ?? null : null;
      const moveOnOpen = p.move_on_open ? 1 : 0;
      const defaultDaysAfterOpen = p.default_best_before_days_after_open ?? null;
      const defaultDaysAfterFreezing = p.default_best_before_days_after_freezing ?? null;
      const defaultDaysAfterThawing = p.default_best_before_days_after_thawing ?? null;
      const treatOpenedAsOutOfStock = p.treat_opened_as_out_of_stock ? 1 : 0;
      const dueType = p.due_type === 2 ? 'use_by' : 'best_before';

      insertProduct.run(
        newId,
        householdId,
        p.name,
        p.description ?? null,
        JSON.stringify(productBarcodes),
        JSON.stringify(pictureFileNames),
        0, // cannotBeFrozen default 0
        null, // openLocationId
        moveOnOpen,
        defaultStoreId,
        dueType,
        p.default_best_before_days ?? 0,
        defaultDaysAfterOpen,
        defaultDaysAfterFreezing,
        defaultDaysAfterThawing,
        p.min_stock_amount ?? 0,
        treatOpenedAsOutOfStock,
        groupId,
        locId,
        quStock,
        quPurchase,
        p.qu_factor_purchase_to_stock ?? 1.0,
        extra?.yukaScore ?? null,
        extra?.tastesGood !== undefined ? (extra.tastesGood ? 1 : 0) : null,
        parentId,
        p.active !== undefined ? (p.active ? 1 : 0) : 1,
        nowIso,
        nowIso,
      );

      // Link preferred store if specified in Grocy
      if (p.shopping_location_id && storeMap.has(p.shopping_location_id)) {
        const storeId = storeMap.get(p.shopping_location_id)!;
        insertProductStore.run(randomUUID(), householdId, newId, storeId, nowIso, nowIso);
      }
    }

    console.log(`✓ Migrated ${grocyProducts.length} products (${picturesMigrated} product pictures converted to WebP).`);
  } catch (err: any) {
    console.error(`! Products migration error: ${err.message}`);
  }

  // 8. Stock Items
  try {
    const grocyStock = grocy.prepare('SELECT * FROM stock').all() as any[];
    const insertStock = cambusa.prepare(`
      INSERT INTO stock_items (
        id, householdId, productId, amount, bestBeforeDate, purchasedDate, price, locationId, isOpen, openedDate, note, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let stockCount = 0;
    for (const s of grocyStock) {
      const prodId = productMap.get(s.product_id);
      if (!prodId) continue;

      const locId = s.location_id ? locationMap.get(s.location_id) ?? null : null;
      const rawBestBefore = s.best_before_date ? String(s.best_before_date).trim() : null;
      const bestBeforeDate =
        rawBestBefore && rawBestBefore !== '2999-12-31' && !rawBestBefore.startsWith('2999') ? rawBestBefore : null;

      insertStock.run(
        randomUUID(),
        householdId,
        prodId,
        s.amount ?? 1,
        bestBeforeDate,
        s.purchased_date ?? null,
        s.price !== '' && s.price !== undefined && s.price !== null ? Number(s.price) : null,
        locId,
        s.open ? 1 : 0,
        s.opened_date ?? null,
        s.note ?? null,
        nowIso,
        nowIso,
      );
      stockCount++;
    }

    console.log(`✓ Migrated ${stockCount} stock items.`);
  } catch (err: any) {
    console.warn(`! Stock migration note: ${err.message}`);
  }

  // 9. Shopping Lists & Items
  try {
    const listMap = new Map<number | string, string>(); // grocyListId -> cambusaListId
    let defaultListId: string | undefined;

    const existingList = cambusa
      .prepare('SELECT id FROM shopping_lists WHERE householdId = ? AND isDefault = 1')
      .get(householdId) as { id: string } | undefined;
    if (existingList) {
      defaultListId = existingList.id;
    }

    let grocyLists: any[] = [];
    try {
      grocyLists = grocy.prepare('SELECT * FROM shopping_lists').all() as any[];
    } catch {
      // shopping_lists table may not exist
    }

    const insertList = cambusa.prepare(`
      INSERT INTO shopping_lists (id, householdId, name, storeId, isDefault, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    if (grocyLists.length > 0) {
      for (let i = 0; i < grocyLists.length; i++) {
        const gl = grocyLists[i];
        const newListId = randomUUID();
        const isDefault = !defaultListId && i === 0;
        if (isDefault) defaultListId = newListId;
        listMap.set(gl.id, newListId);
        const storeId = gl.shopping_location_id ? storeMap.get(gl.shopping_location_id) ?? null : null;
        insertList.run(newListId, householdId, gl.name, storeId, isDefault ? 1 : 0, nowIso, nowIso);
      }
      console.log(`✓ Migrated ${grocyLists.length} shopping lists.`);
    } else if (!defaultListId) {
      defaultListId = randomUUID();
      insertList.run(defaultListId, householdId, 'Weekly Groceries', null, 1, nowIso, nowIso);
    }

    const grocyShoppingList = grocy.prepare('SELECT * FROM shopping_list').all() as any[];

    const insertShoppingItem = cambusa.prepare(`
      INSERT INTO shopping_list_items (
        id, householdId, shoppingListId, productId, customName, amount, quId, storeId, note, done, doneAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?)
    `);

    let shoppingCount = 0;
    for (const item of grocyShoppingList) {
      const prodId = item.product_id ? productMap.get(item.product_id) ?? null : null;
      const quId = item.qu_id ? unitMap.get(item.qu_id) ?? null : null;
      const targetListId = (item.shopping_list_id ? listMap.get(item.shopping_list_id) : null) ?? defaultListId!;

      insertShoppingItem.run(
        randomUUID(),
        householdId,
        targetListId,
        prodId,
        item.amount ?? 1,
        quId,
        item.note ?? null,
        item.done ? 1 : 0,
        item.done ? nowIso : null,
        nowIso,
        nowIso,
      );
      shoppingCount++;
    }

    console.log(`✓ Migrated ${shoppingCount} shopping list items.`);
  } catch (err: any) {
    console.warn(`! Shopping list migration note: ${err.message}`);
  }

  cambusa.pragma('foreign_keys = ON');
  grocy.close();
  cambusa.close();

  console.log('--- Migration completed successfully! ---');
}

// Execute CLI when directly invoked
if (process.argv[1] && process.argv[1].includes('migrate-grocy')) {
  runMigration().catch((err) => {
    console.error('Fatal migration failure:', err);
    process.exit(1);
  });
}
