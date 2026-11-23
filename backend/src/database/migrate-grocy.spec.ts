import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveGrocyDb, resolvePictureDirs, runMigration } from './migrate-grocy.js';

describe('Grocy Migration Verification', () => {
  const testDir = 'test-grocy-env';
  const grocyDbPath = join(testDir, 'grocy.db');
  const grocyPicsDir = join(testDir, 'storage', 'productpictures');
  const cambusaDbPath = join(testDir, 'cambusa-test.sqlite');
  const uploadsDir = join(testDir, 'uploads');

  beforeAll(async () => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    mkdirSync(grocyPicsDir, { recursive: true });

    // 1. Create a mock Grocy DB
    const grocy = new Database(grocyDbPath);
    grocy.exec(`
      CREATE TABLE quantity_units (id INTEGER PRIMARY KEY, name TEXT, description TEXT, name_plural TEXT, active INTEGER);
      INSERT INTO quantity_units VALUES (1, 'Piece', 'Single item', 'Pieces', 1);

      CREATE TABLE product_groups (id INTEGER PRIMARY KEY, name TEXT, description TEXT, active INTEGER);
      INSERT INTO product_groups VALUES (10, 'Dairy', 'Milk and Cheese', 1);

      CREATE TABLE locations (id INTEGER PRIMARY KEY, name TEXT, description TEXT, is_freezer INTEGER, active INTEGER);
      INSERT INTO locations VALUES (100, 'Fridge', 'Main refrigerator', 0, 1);

      CREATE TABLE shopping_locations (id INTEGER PRIMARY KEY, name TEXT, description TEXT, active INTEGER);
      INSERT INTO shopping_locations VALUES (200, 'Supermarket Coop', 'Local supermarket', 1);

      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        name TEXT,
        description TEXT,
        product_group_id INTEGER,
        active INTEGER,
        location_id INTEGER,
        shopping_location_id INTEGER,
        qu_id_stock INTEGER,
        qu_id_purchase INTEGER,
        qu_factor_purchase_to_stock REAL,
        min_stock_amount REAL,
        default_best_before_days INTEGER,
        picture_file_name TEXT,
        parent_product_id INTEGER
      );
      INSERT INTO products (id, name, product_group_id, location_id, shopping_location_id, qu_id_stock, min_stock_amount, picture_file_name, parent_product_id)
      VALUES (1, 'Organic Milk 1L', 10, 100, 200, 1, 2, 'milk.jpg', NULL);
      INSERT INTO products (id, name, product_group_id, location_id, shopping_location_id, qu_id_stock, min_stock_amount, picture_file_name, parent_product_id)
      VALUES (2, 'Whole Milk 1L', 10, 100, 200, 1, 1, '', 1);

      CREATE TABLE product_barcodes (
        id INTEGER PRIMARY KEY,
        product_id INTEGER,
        barcode TEXT
      );
      INSERT INTO product_barcodes VALUES (1, 1, '8001234567890');
      INSERT INTO product_barcodes VALUES (2, 1, '8001234567891');

      CREATE TABLE product_files (
        id INTEGER PRIMARY KEY,
        product_id INTEGER,
        file_name TEXT
      );
      INSERT INTO product_files VALUES (1, 1, 'milk_nutrition.jpg');

      CREATE TABLE userfields (
        id INTEGER PRIMARY KEY,
        entity TEXT,
        name TEXT
      );
      INSERT INTO userfields VALUES (1, 'products', 'yuka_score');
      INSERT INTO userfields VALUES (2, 'products', 'tastes_good');

      CREATE TABLE userfield_values (
        object_id INTEGER,
        field_id INTEGER,
        value TEXT
      );
      INSERT INTO userfield_values VALUES (1, 1, '90');
      INSERT INTO userfield_values VALUES (1, 2, '5');

      CREATE TABLE stock (
        id INTEGER PRIMARY KEY,
        product_id INTEGER,
        amount REAL,
        best_before_date TEXT,
        purchased_date TEXT,
        price REAL,
        open INTEGER,
        opened_date TEXT,
        location_id INTEGER,
        note TEXT
      );
      INSERT INTO stock (id, product_id, amount, best_before_date, price, open, location_id)
      VALUES (1, 1, 3, '2026-12-01', 1.89, 0, 100);

      CREATE TABLE shopping_lists (
        id INTEGER PRIMARY KEY,
        name TEXT
      );
      INSERT INTO shopping_lists VALUES (1, 'Weekly Groceries');

      CREATE TABLE shopping_list (
        id INTEGER PRIMARY KEY,
        product_id INTEGER,
        note TEXT,
        amount REAL,
        shopping_list_id INTEGER,
        done INTEGER,
        qu_id INTEGER
      );
      INSERT INTO shopping_list (id, product_id, note, amount, shopping_list_id, done, qu_id)
      VALUES (1, 2, 'Buy 2 bottles', 2, 1, 0, 1);
    `);
    grocy.close();

    // Create a mock image file
    const sampleImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();
    writeFileSync(join(grocyPicsDir, 'milk.jpg'), sampleImage);
    writeFileSync(join(grocyPicsDir, 'milk_nutrition.jpg'), sampleImage);
  });

  afterAll(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('resolves database and picture paths from the specified folder correctly', () => {
    const resolvedDb = resolveGrocyDb(testDir);
    expect(resolvedDb).toBe(join(process.cwd(), grocyDbPath));

    const resolvedPics = resolvePictureDirs(testDir);
    expect(resolvedPics.length).toBeGreaterThan(0);
    expect(resolvedPics).toContain(join(process.cwd(), grocyPicsDir));
  });

  it('throws an error if the specified folder does not exist or has no grocy.db', () => {
    expect(() => resolveGrocyDb('non-existent-folder')).toThrow('Grocy folder not found');
  });

  it('runs end-to-end migration into Cambusa schema correctly', async () => {
    await runMigration({
      grocyDir: testDir,
      cambusaDb: cambusaDbPath,
      uploadsDir: uploadsDir,
    });

    const cambusa = new Database(cambusaDbPath, { readonly: true });

    // 1. Verify Household
    const households = cambusa.prepare('SELECT * FROM households').all() as any[];
    expect(households.length).toBe(1);
    const householdId = households[0].id;

    // 2. Verify Units
    const units = cambusa.prepare('SELECT * FROM quantity_units WHERE householdId = ?').all(householdId) as any[];
    expect(units.length).toBe(1);
    expect(units[0].name).toBe('Piece');

    // 3. Verify Groups
    const groups = cambusa.prepare('SELECT * FROM product_groups WHERE householdId = ?').all(householdId) as any[];
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('Dairy');

    // 4. Verify Locations
    const locations = cambusa.prepare('SELECT * FROM locations WHERE householdId = ?').all(householdId) as any[];
    expect(locations.length).toBe(1);
    expect(locations[0].name).toBe('Fridge');

    // 5. Verify Stores
    const stores = cambusa.prepare('SELECT * FROM stores WHERE householdId = ?').all(householdId) as any[];
    expect(stores.length).toBe(1);
    expect(stores[0].name).toBe('Supermarket Coop');

    // 6. Verify Products & Hierarchy & Userfields & Barcodes
    const products = cambusa.prepare('SELECT * FROM products WHERE householdId = ?').all(householdId) as any[];
    expect(products.length).toBe(2);

    const parentProd = products.find((p) => p.name === 'Organic Milk 1L');
    const childProd = products.find((p) => p.name === 'Whole Milk 1L');
    expect(parentProd).toBeTruthy();
    expect(childProd).toBeTruthy();
    expect(childProd.parentProductId).toBe(parentProd.id);
    const parentBarcodes = JSON.parse(parentProd.barcodes);
    expect(parentBarcodes).toContain('8001234567890');
    expect(parentBarcodes).toContain('8001234567891');
    expect(parentProd.yukaScore).toBe(90);
    expect(parentProd.tastesGood).toBe(1);

    const parentPics = JSON.parse(parentProd.pictureFileNames);
    expect(parentPics.length).toBe(2);
    expect(parentPics[0].endsWith('.webp')).toBe(true);
    expect(parentPics[1].endsWith('.webp')).toBe(true);

    // Verify converted picture files exist on disk
    expect(existsSync(join(uploadsDir, 'products', parentPics[0]))).toBe(true);
    expect(existsSync(join(uploadsDir, 'products', parentPics[1]))).toBe(true);

    // 7. Verify Stock
    const stock = cambusa.prepare('SELECT * FROM stock_items WHERE householdId = ?').all(householdId) as any[];
    expect(stock.length).toBe(1);
    expect(stock[0].productId).toBe(parentProd.id);
    expect(stock[0].amount).toBe(3);
    expect(stock[0].bestBeforeDate).toBe('2026-12-01');

    // 8. Verify Shopping Lists & Items
    const shoppingLists = cambusa.prepare('SELECT * FROM shopping_lists WHERE householdId = ?').all(householdId) as any[];
    expect(shoppingLists.length).toBe(1);
    expect(shoppingLists[0].name).toBe('Weekly Groceries');

    const shoppingItems = cambusa.prepare('SELECT * FROM shopping_list_items WHERE householdId = ?').all(householdId) as any[];
    expect(shoppingItems.length).toBe(1);
    expect(shoppingItems[0].productId).toBe(childProd.id);
    expect(shoppingItems[0].amount).toBe(2);

    cambusa.close();
  });
});
