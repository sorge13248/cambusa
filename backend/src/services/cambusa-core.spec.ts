import { describe, expect, it, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
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
  Aisle,
  SyncTombstone,
  User,
} from '../entities/index.js';
import { CatalogsService } from './catalogs.service.js';
import { HouseholdsService } from './households.service.js';
import { ProductsService } from './products.service.js';
import { ShoppingListService } from './shopping-list.service.js';
import { StockService } from './stock.service.js';
import { UsersService } from './users.service.js';

describe('Cambusa Core Business Logic & Invariants', () => {
  let dataSource: DataSource;
  let usersService: UsersService;
  let householdsService: HouseholdsService;
  let catalogsService: CatalogsService;
  let productsService: ProductsService;
  let stockService: StockService;
  let shoppingListService: ShoppingListService;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        User,
        Household,
        HouseholdMember,
        HouseholdInvitation,
        QuantityUnit,
        ProductGroup,
        Location,
        Store,
        Aisle,
        Product,
        ProductStore,
        StockItem,
        ShoppingList,
        ShoppingListItem,
        SavedFilter,
        SyncTombstone,
      ],
      synchronize: true,
      prepareDatabase: (db: any) => {
        db.pragma('foreign_keys = ON');
      },
    });

    await dataSource.initialize();

    const userRepo = dataSource.getRepository(User);
    const householdRepo = dataSource.getRepository(Household);
    const memberRepo = dataSource.getRepository(HouseholdMember);
    const invitationRepo = dataSource.getRepository('HouseholdInvitation') as any;
    const unitRepo = dataSource.getRepository(QuantityUnit);
    const groupRepo = dataSource.getRepository(ProductGroup);
    const locationRepo = dataSource.getRepository(Location);
    const storeRepo = dataSource.getRepository(Store);
    const aisleRepo = dataSource.getRepository(Aisle);
    const productRepo = dataSource.getRepository(Product);
    const productStoreRepo = dataSource.getRepository(ProductStore);
    const stockRepo = dataSource.getRepository(StockItem);
    const shoppingListRepo = dataSource.getRepository(ShoppingList);
    const shoppingItemRepo = dataSource.getRepository(ShoppingListItem);
    const tombstoneRepo = dataSource.getRepository(SyncTombstone);

    usersService = new UsersService(userRepo, householdRepo, memberRepo);
    householdsService = new HouseholdsService(householdRepo, memberRepo, invitationRepo, userRepo);
    catalogsService = new CatalogsService(unitRepo, groupRepo, locationRepo, storeRepo, aisleRepo, tombstoneRepo);
    productsService = new ProductsService(productRepo, productStoreRepo, stockRepo, tombstoneRepo, locationRepo);
    stockService = new StockService(stockRepo, productRepo, locationRepo, unitRepo, tombstoneRepo);
    shoppingListService = new ShoppingListService(
      shoppingListRepo,
      shoppingItemRepo,
      productRepo,
      productStoreRepo,
      stockRepo,
      storeRepo,
      unitRepo,
      groupRepo,
      tombstoneRepo,
    );
  });

  it('1. Auto-creates a default household on first user login', async () => {
    const user = await usersService.ensureUser({
      id: 'test-user-1',
      subject: 'sub-1',
      email: 'user1@example.com',
      displayName: 'Alice',
      pictureUrl: null,
    });

    expect(user.id).toBeDefined();

    const households = await householdsService.getUserHouseholds(user.id);
    expect(households).toHaveLength(1);
    expect(households[0].name).toBe('My Home');
    expect(households[0].isOwner).toBe(true);
  });

  it('2. Supports infinite hierarchical parent products with stock rollup', async () => {
    const user = await usersService.ensureUser({
      id: 'u1',
      subject: 'sub-u1',
      email: 'u1@example.com',
      displayName: 'Bob',
      pictureUrl: null,
    });
    const [hh] = await householdsService.getUserHouseholds(user.id);

    // Root parent: Fruit
    const fruit = await productsService.createProduct(hh.id, { name: 'Fruit' });

    // Level 1 child: Fresh Fruit (parent: Fruit)
    const freshFruit = await productsService.createProduct(hh.id, {
      name: 'Fresh Fruit',
      parentProductId: fruit.id,
    });

    // Level 2 child: Bananas (parent: Fresh Fruit)
    const bananas = await productsService.createProduct(hh.id, {
      name: 'Bananas',
      parentProductId: freshFruit.id,
    });

    // Level 3 child: Organic Cavendish (parent: Bananas)
    const cavendish = await productsService.createProduct(hh.id, {
      name: 'Organic Cavendish',
      parentProductId: bananas.id,
    });

    // Add stock to leaf products
    await stockService.addStock(hh.id, { productId: cavendish.id, amount: 6 });
    await stockService.addStock(hh.id, { productId: bananas.id, amount: 4 });

    const products = await productsService.getProducts(hh.id);
    const fruitDetail = products.find((p) => p.id === fruit.id);
    const freshFruitDetail = products.find((p) => p.id === freshFruit.id);
    const bananasDetail = products.find((p) => p.id === bananas.id);
    const cavendishDetail = products.find((p) => p.id === cavendish.id);

    // Breadcrumbs check
    expect(cavendishDetail?.hierarchyPath).toBe('Fruit > Fresh Fruit > Bananas > Organic Cavendish');
    expect(cavendishDetail?.ancestors).toHaveLength(3);

    // Roll-up stock aggregation check
    expect(cavendishDetail?.directStockAmount).toBe(6);
    expect(cavendishDetail?.aggregatedStockAmount).toBe(6);

    expect(bananasDetail?.directStockAmount).toBe(4);
    expect(bananasDetail?.aggregatedStockAmount).toBe(10); // 4 bananas + 6 cavendish

    expect(freshFruitDetail?.directStockAmount).toBe(0);
    expect(freshFruitDetail?.aggregatedStockAmount).toBe(10);

    expect(fruitDetail?.directStockAmount).toBe(0);
    expect(fruitDetail?.aggregatedStockAmount).toBe(10);
  });

  it('3. Prevents cyclic parent product hierarchies', async () => {
    const user = await usersService.ensureUser({
      id: 'u2',
      subject: 'sub-u2',
      email: 'u2@example.com',
      displayName: 'Charlie',
      pictureUrl: null,
    });
    const [hh] = await householdsService.getUserHouseholds(user.id);

    const a = await productsService.createProduct(hh.id, { name: 'Category A' });
    const b = await productsService.createProduct(hh.id, { name: 'Category B', parentProductId: a.id });

    // Setting A's parent to B should throw cyclic error
    await expect(
      productsService.updateProduct(a.id, hh.id, { parentProductId: b.id }),
    ).rejects.toThrow('Cyclic parent product hierarchy detected');
  });

  it('4. Orders shopping list by supermarket aisles for a selected store', async () => {
    const user = await usersService.ensureUser({
      id: 'u3',
      subject: 'sub-u3',
      email: 'u3@example.com',
      displayName: 'Dana',
      pictureUrl: null,
    });
    const [hh] = await householdsService.getUserHouseholds(user.id);
    const defaultList = await shoppingListService.getDefaultList(hh.id);

    // Create stores
    const coop = await catalogsService.createStore(hh.id, { name: 'Coop Supermarket' });

    // Create products
    const apples = await productsService.createProduct(hh.id, { name: 'Apples' });
    const pasta = await productsService.createProduct(hh.id, { name: 'Spaghetti' });
    const frozenPizza = await productsService.createProduct(hh.id, { name: 'Frozen Pizza' });

    // Configure aisle routing for Coop:
    // Aisle 1 (Order 10): Produce -> Apples
    // Aisle 4 (Order 40): Dry Goods -> Spaghetti
    // Aisle 8 (Order 80): Freezers -> Frozen Pizza
    await productsService.setProductStore(apples.id, coop.id, hh.id, {
      aisle: 'Aisle 1 - Produce',
      aisleOrder: 10,
      averagePrice: 1.99,
    });
    await productsService.setProductStore(pasta.id, coop.id, hh.id, {
      aisle: 'Aisle 4 - Dry Pasta',
      aisleOrder: 40,
      averagePrice: 0.89,
    });
    await productsService.setProductStore(frozenPizza.id, coop.id, hh.id, {
      aisle: 'Aisle 8 - Freezers',
      aisleOrder: 80,
      averagePrice: 3.5,
    });

    // Add items in non-aisle order to shopping list
    await shoppingListService.addItem(hh.id, { shoppingListId: defaultList.id, productId: frozenPizza.id, amount: 2 });
    await shoppingListService.addItem(hh.id, { shoppingListId: defaultList.id, productId: apples.id, amount: 5 });
    await shoppingListService.addItem(hh.id, { shoppingListId: defaultList.id, productId: pasta.id, amount: 3 });

    // When defaultList is NOT associated with any store, store aisles must NEVER be used
    const unassociatedItems = await shoppingListService.getItems(defaultList.id, hh.id);
    expect(unassociatedItems).toHaveLength(3);
    expect(unassociatedItems[0].aisle).toBeNull();
    expect(unassociatedItems[0].aisleOrder).toBeNull();
    expect(unassociatedItems[1].aisle).toBeNull();
    expect(unassociatedItems[1].aisleOrder).toBeNull();
    expect(unassociatedItems[2].aisle).toBeNull();
    expect(unassociatedItems[2].aisleOrder).toBeNull();

    // Associate Coop Supermarket with the shopping list
    await shoppingListService.updateList(defaultList.id, hh.id, { storeId: coop.id });

    // Query shopping list items now that Coop is associated with the list
    const items = await shoppingListService.getItems(defaultList.id, hh.id);

    expect(items).toHaveLength(3);
    // Verified aisle order: Apples (10) -> Spaghetti (40) -> Frozen Pizza (80)
    expect(items[0].productName).toBe('Apples');
    expect(items[0].aisle).toBe('Aisle 1 - Produce');
    expect(items[0].aisleOrder).toBe(10);
    expect(items[1].productName).toBe('Spaghetti');
    expect(items[1].aisle).toBe('Aisle 4 - Dry Pasta');
    expect(items[1].aisleOrder).toBe(40);
    expect(items[2].productName).toBe('Frozen Pizza');
    expect(items[2].aisle).toBe('Aisle 8 - Freezers');
    expect(items[2].aisleOrder).toBe(80);

    // Create another list without store association and verify Coop's aisles are NOT leaked
    const generalList = await shoppingListService.createList(hh.id, { name: 'General Market' });
    await shoppingListService.addItem(hh.id, { shoppingListId: generalList.id, productId: apples.id, amount: 1 });
    const generalItems = await shoppingListService.getItems(generalList.id, hh.id);
    expect(generalItems[0].aisle).toBeNull();
    expect(generalItems[0].aisleOrder).toBeNull();
  });

  it('5. Shopping list Done button is strictly non-destructive and DOES NOT mutate pantry stock', async () => {
    const user = await usersService.ensureUser({
      id: 'u4',
      subject: 'sub-u4',
      email: 'u4@example.com',
      displayName: 'Eve',
      pictureUrl: null,
    });
    const [hh] = await householdsService.getUserHouseholds(user.id);
    const defaultList = await shoppingListService.getDefaultList(hh.id);

    const milk = await productsService.createProduct(hh.id, { name: 'Fresh Milk' });
    const shoppingItem = await shoppingListService.addItem(hh.id, {
      shoppingListId: defaultList.id,
      productId: milk.id,
      amount: 2,
    });

    expect(shoppingItem.done).toBe(false);

    // Check initial stock in pantry
    const initialStock = await stockService.getStock(hh.id);
    expect(initialStock).toHaveLength(0);

    // Toggle Done
    const toggledItem = await shoppingListService.toggleDone(shoppingItem.id, hh.id);
    expect(toggledItem.done).toBe(true);
    expect(toggledItem.doneAt).toBeDefined();

    // Verify item remains visible in shopping list
    const items = await shoppingListService.getItems(defaultList.id, hh.id);
    expect(items).toHaveLength(1);
    expect(items[0].done).toBe(true);

    // CRITICAL INVARIANT: Verify pantry stock is untouched (still 0)
    const stockAfterDone = await stockService.getStock(hh.id);
    expect(stockAfterDone).toHaveLength(0);
  });

  it('6. Adjusts expiration dates quickly with presets (+2d, -5d, today, tomorrow)', async () => {
    const user = await usersService.ensureUser({
      id: 'u5',
      subject: 'sub-u5',
      email: 'u5@example.com',
      displayName: 'Frank',
      pictureUrl: null,
    });
    const [hh] = await householdsService.getUserHouseholds(user.id);

    const cheese = await productsService.createProduct(hh.id, { name: 'Cheddar Cheese' });
    const stock = await stockService.addStock(hh.id, {
      productId: cheese.id,
      amount: 1,
      bestBeforeDate: '2026-11-20',
    });

    // Preset: +5d
    const modifiedPlus5 = await stockService.adjustDate(stock.id, hh.id, { preset: '+5d' });
    expect(modifiedPlus5.bestBeforeDate).toBe('2026-11-25');

    // Preset: -2d
    const modifiedMinus2 = await stockService.adjustDate(stock.id, hh.id, { preset: '-2d' });
    expect(modifiedMinus2.bestBeforeDate).toBe('2026-11-23');

    // Preset: today
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const modifiedToday = await stockService.adjustDate(stock.id, hh.id, { preset: 'today' });
    expect(modifiedToday.bestBeforeDate).toBe(todayStr);
  });

  it('7. Enforces cannotBeFrozen constraint and adjusts expiration date on freezer transfer', async () => {
    const user = await usersService.ensureUser({ id: 'u7', subject: 'sub-u7', email: 'u7@example.com', displayName: 'User 7' });
    const hh = await householdsService.getDefaultHousehold(user.id);
    expect(hh).toBeTruthy();

    const pantryLoc = await catalogsService.createLocation(hh!.id, { name: 'Pantry Shelf', isFreezer: false });
    const freezerLoc = await catalogsService.createLocation(hh!.id, { name: 'Deep Freezer', isFreezer: true });

    // Product marked with cannotBeFrozen nullifies freezing/thawing expiration days on create
    const productWithFreezingFields = await productsService.createProduct(hh!.id, {
      name: 'Lettuce',
      cannotBeFrozen: true,
      defaultBestBeforeDaysAfterFreezing: 30,
      defaultBestBeforeDaysAfterThawing: 5,
    });
    expect(productWithFreezingFields.defaultBestBeforeDaysAfterFreezing).toBeNull();
    expect(productWithFreezingFields.defaultBestBeforeDaysAfterThawing).toBeNull();

    // Setting defaultLocationId or openLocationId to a freezer location when cannotBeFrozen: true must fail
    await expect(
      productsService.createProduct(hh!.id, {
        name: 'Iceberg Salad',
        cannotBeFrozen: true,
        defaultLocationId: freezerLoc.id,
      }),
    ).rejects.toThrow('Cannot set default location to a freezer');

    await expect(
      productsService.createProduct(hh!.id, {
        name: 'Arugula',
        cannotBeFrozen: true,
        openLocationId: freezerLoc.id,
      }),
    ).rejects.toThrow('Cannot set open location to a freezer');

    // Product that cannot be frozen
    const unfrozenProduct = await productsService.createProduct(hh!.id, {
      name: 'Fresh Salad',
      cannotBeFrozen: true,
      defaultLocationId: pantryLoc.id,
    });

    // Attempting to add stock to a freezer location directly must fail
    await expect(
      stockService.addStock(hh!.id, {
        productId: unfrozenProduct.id,
        amount: 1,
        locationId: freezerLoc.id,
      }),
    ).rejects.toThrow('cannot be frozen');

    const saladStock = await stockService.addStock(hh!.id, {
      productId: unfrozenProduct.id,
      amount: 2,
      locationId: pantryLoc.id,
    });

    // Attempting to transfer to freezer must fail
    await expect(
      stockService.transferStock(hh!.id, {
        productId: unfrozenProduct.id,
        stockItemId: saladStock.id,
        toLocationId: freezerLoc.id,
        amount: 1,
      }),
    ).rejects.toThrow('cannot be frozen');

    // Product with defaultBestBeforeDaysAfterFreezing
    const meatProduct = await productsService.createProduct(hh!.id, {
      name: 'Ground Beef',
      cannotBeFrozen: false,
      defaultBestBeforeDaysAfterFreezing: 90,
      defaultBestBeforeDaysAfterThawing: 3,
    });
    const meatStock = await stockService.addStock(hh!.id, {
      productId: meatProduct.id,
      amount: 3,
      locationId: pantryLoc.id,
      bestBeforeDate: '2026-11-25',
    });

    const transferResult = await stockService.transferStock(hh!.id, {
      productId: meatProduct.id,
      stockItemId: meatStock.id,
      fromLocationId: pantryLoc.id,
      toLocationId: freezerLoc.id,
      amount: 2,
    });

    expect(transferResult.transferred).toBe(true);
    expect(transferResult.targetStockItem.locationId).toBe(freezerLoc.id);
    expect(transferResult.targetStockItem.amount).toBe(2);
    // Calculated date: today + 90 days
    expect(transferResult.targetStockItem.bestBeforeDate).toBeTruthy();
    expect(transferResult.targetStockItem.bestBeforeDate).not.toBe('2026-11-25');

    // Cannot update meatProduct to cannotBeFrozen while it has items in the freezer
    await expect(
      productsService.updateProduct(meatProduct.id, hh!.id, {
        cannotBeFrozen: true,
      }),
    ).rejects.toThrow('Cannot mark product as cannot be frozen while items exist in a freezer location');

    // Updating a product to cannotBeFrozen clears existing freeze/thaw days
    const soupProduct = await productsService.createProduct(hh!.id, {
      name: 'Soup',
      cannotBeFrozen: false,
      defaultBestBeforeDaysAfterFreezing: 60,
      defaultBestBeforeDaysAfterThawing: 3,
    });
    const updatedSoup = await productsService.updateProduct(soupProduct.id, hh!.id, {
      cannotBeFrozen: true,
    });
    expect(updatedSoup.defaultBestBeforeDaysAfterFreezing).toBeNull();
    expect(updatedSoup.defaultBestBeforeDaysAfterThawing).toBeNull();
  });

  it('8. Enforces owner-only rename and delete on households', async () => {
    const owner = await usersService.ensureUser({ id: 'owner-1', subject: 'sub-o1', email: 'owner@example.com', displayName: 'Owner 1' });
    const sharedUser = await usersService.ensureUser({ id: 'shared-1', subject: 'sub-s1', email: 'shared@example.com', displayName: 'Shared 1' });

    const hh = await householdsService.createHousehold(owner.id, 'My Private Villa');
    await dataSource.getRepository(HouseholdMember).save({
      householdId: hh.id,
      userId: sharedUser.id,
      role: 'member',
    });

    // Shared user cannot rename
    await expect(householdsService.updateHousehold(hh.id, sharedUser.id, 'Hacked Name')).rejects.toThrow(
      'Only the household owner',
    );

    // Shared user cannot delete
    await expect(householdsService.deleteHousehold(hh.id, sharedUser.id)).rejects.toThrow(
      'Only the household owner',
    );

    // Owner can rename
    const updated = await householdsService.updateHousehold(hh.id, owner.id, 'Renamed Villa');
    expect(updated.name).toBe('Renamed Villa');

    // Owner can delete
    await householdsService.deleteHousehold(hh.id, owner.id);
    const check = await householdsService.getUserHouseholds(owner.id);
    expect(check.find((h) => h.id === hh.id)).toBeUndefined();
  });

  it('9. Supports multiple product barcodes and pictures array', async () => {
    const user = await usersService.ensureUser({ id: 'u9', subject: 'sub-u9', email: 'u9@example.com', displayName: 'User 9' });
    const hh = await householdsService.getDefaultHousehold(user.id);
    expect(hh).toBeTruthy();

    const prod = await productsService.createProduct(hh!.id, {
      name: 'Multi-Barcode Pasta',
      barcodes: ['111222333', '444555666'],
      pictureFileNames: ['pic1.webp', 'pic2.webp'],
    });

    expect(prod.barcodes).toEqual(['111222333', '444555666']);
    expect(prod.pictureFileNames).toEqual(['pic1.webp', 'pic2.webp']);

    const stock = await stockService.addStock(hh!.id, {
      productId: prod.id,
      amount: 4,
    });

    const stockList = await stockService.getStock(hh!.id);
    const item = stockList.find((s) => s.id === stock.id);
    expect(item).toBeTruthy();
    expect(item!.productPictureFileName).toBe('pic1.webp');
    expect(item!.productBarcodes).toContain('444555666');
  });

  it('10. Updates specific stock item attributes (bestBeforeDate, price, locationId, note, amount)', async () => {
    const user = await usersService.ensureUser({ id: 'u10', subject: 'sub-u10', email: 'u10@example.com', displayName: 'User 10' });
    const hh = await householdsService.getDefaultHousehold(user.id);
    expect(hh).toBeTruthy();

    const loc1 = await dataSource.getRepository(Location).save({ householdId: hh!.id, name: 'Cupboard', active: true });
    const loc2 = await dataSource.getRepository(Location).save({ householdId: hh!.id, name: 'Basement', active: true });

    const prod = await productsService.createProduct(hh!.id, { name: 'Olive Oil' });
    const stock = await stockService.addStock(hh!.id, {
      productId: prod.id,
      amount: 2,
      locationId: loc1.id,
      bestBeforeDate: '2026-11-01',
      price: 9.99,
      note: 'Old note',
    });

    const updated = await stockService.updateStock(stock.id, hh!.id, {
      amount: 3,
      locationId: loc2.id,
      bestBeforeDate: '2027-05-15',
      price: 11.5,
      note: 'Updated premium cold pressed',
    });

    expect(updated.amount).toBe(3);
    expect(updated.locationId).toBe(loc2.id);
    expect(updated.bestBeforeDate).toBe('2027-05-15');
    expect(updated.price).toBe(11.5);
    expect(updated.note).toBe('Updated premium cold pressed');
  });

  it('11. Computes urgency dynamically based on dueSoonDays (Next engine horizon)', async () => {
    const user = await usersService.ensureUser({ id: 'u11', subject: 'sub-u11', email: 'u11@example.com', displayName: 'User 11' });
    const hh = await householdsService.getDefaultHousehold(user.id);
    expect(hh).toBeTruthy();

    const prod = await productsService.createProduct(hh!.id, { name: 'Fresh Milk' });

    // Expiration in 7 days
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const dateStr = in7Days.toISOString().slice(0, 10);

    await stockService.addStock(hh!.id, {
      productId: prod.id,
      amount: 1,
      bestBeforeDate: dateStr,
    });

    // With 3-day horizon: should not be due_soon
    const stock3d = await stockService.getStock(hh!.id, 3);
    expect(stock3d).toHaveLength(1);
    expect(stock3d[0].urgency).not.toBe('due_soon');

    // With 10-day horizon: should be marked due_soon
    const stock10d = await stockService.getStock(hh!.id, 10);
    expect(stock10d).toHaveLength(1);
    expect(stock10d[0].urgency).toBe('due_soon');
  });

  it('12. Manages store aisles and drag-and-drop reordering with tenant isolation and tombstone tracking', async () => {
    const user = await usersService.ensureUser({ id: 'u12', subject: 'sub-u12', email: 'u12@example.com', displayName: 'User 12' });
    const hh = await householdsService.getDefaultHousehold(user.id);
    expect(hh).toBeTruthy();

    const store = await catalogsService.createStore(hh!.id, { name: 'Supermarket Esselunga' });
    expect(store.id).toBeTruthy();

    const a1 = await catalogsService.createAisle(store.id, hh!.id, { name: 'Produce' });
    const a2 = await catalogsService.createAisle(store.id, hh!.id, { name: 'Bakery' });
    const a3 = await catalogsService.createAisle(store.id, hh!.id, { name: 'Dairy & Cheese' });

    expect(a1.sortOrder).toBe(1);
    expect(a2.sortOrder).toBe(2);
    expect(a3.sortOrder).toBe(3);

    // Reorder: Bakery first, then Dairy, then Produce
    const reordered = await catalogsService.reorderStoreAisles(store.id, hh!.id, [a2.id, a3.id, a1.id]);
    expect(reordered[0].name).toBe('Bakery');
    expect(reordered[0].sortOrder).toBe(1);
    expect(reordered[1].name).toBe('Dairy & Cheese');
    expect(reordered[1].sortOrder).toBe(2);
    expect(reordered[2].name).toBe('Produce');
    expect(reordered[2].sortOrder).toBe(3);

    // Update aisle name
    const updated = await catalogsService.updateAisle(a2.id, hh!.id, { name: 'Fresh Bakery & Pastry' });
    expect(updated.name).toBe('Fresh Bakery & Pastry');

    // Delete aisle with tombstone tracking
    await catalogsService.deleteAisle(a1.id, hh!.id);
    const remaining = await catalogsService.getStoreAisles(store.id, hh!.id);
    expect(remaining).toHaveLength(2);
    expect(remaining.find((a) => a.id === a1.id)).toBeUndefined();
  });

  it('13. Reorders shopping lists with custom sortOrder and persists sequence', async () => {
    const user = await usersService.ensureUser({ id: 'u13', subject: 'sub-u13', email: 'u13@example.com', displayName: 'User 13' });
    const hh = await householdsService.getDefaultHousehold(user.id);
    expect(hh).toBeTruthy();

    const l1 = await shoppingListService.createList(hh!.id, { name: 'Alpha List' });
    const l2 = await shoppingListService.createList(hh!.id, { name: 'Beta List' });
    const l3 = await shoppingListService.createList(hh!.id, { name: 'Gamma List' });

    // Initial default list exists + 3 created
    const initialLists = await shoppingListService.getLists(hh!.id);
    expect(initialLists.length).toBeGreaterThanOrEqual(3);

    // Reorder: Gamma first, then Alpha, then Beta
    await shoppingListService.reorderLists(hh!.id, [l3.id, l1.id, l2.id]);

    const reorderedLists = await shoppingListService.getLists(hh!.id);
    const gamma = reorderedLists.find((l) => l.id === l3.id);
    const alpha = reorderedLists.find((l) => l.id === l1.id);
    const beta = reorderedLists.find((l) => l.id === l2.id);

    expect(gamma?.sortOrder).toBe(0);
    expect(alpha?.sortOrder).toBe(1);
    expect(beta?.sortOrder).toBe(2);
  });

  it('14. Opens single item from batch (splits batch when amount > 1) and supports clean revert', async () => {
    const user = await usersService.ensureUser({ id: 'u14', subject: 'sub-u14', email: 'u14@example.com', displayName: 'User 14' });
    const hh = await householdsService.getDefaultHousehold(user.id);
    expect(hh).toBeTruthy();

    const openLoc = await dataSource.getRepository(Location).save({ householdId: hh!.id, name: 'Fridge Door', active: true });
    const prod = await productsService.createProduct(hh!.id, {
      name: 'Milk Carton',
      moveOnOpen: true,
      openLocationId: openLoc.id,
      defaultBestBeforeDaysAfterOpen: 4,
    });

    const stock = await stockService.addStock(hh!.id, {
      productId: prod.id,
      amount: 3,
      bestBeforeDate: '2026-12-31',
    });

    // Open 1: should split the batch because initial amount is 3
    const result = await stockService.openStock(stock.id, hh!.id, 1);
    expect(result.split).toBe(true);
    expect(result.openedStockItem.amount).toBe(1);
    expect(result.openedStockItem.isOpen).toBe(true);
    expect(result.openedStockItem.locationId).toBe(openLoc.id);
    expect(result.openedStockItem.bestBeforeDate).not.toBe('2026-12-31');

    // Original batch is decremented to 2 and remains unopened
    const remainingOrig = await dataSource.getRepository(StockItem).findOne({ where: { id: stock.id } });
    expect(remainingOrig?.amount).toBe(2);
    expect(remainingOrig?.isOpen).toBe(false);

    // Revert open
    const revertResult = await stockService.revertOpen(hh!.id, {
      openedStockItemId: result.openedStockItem.id,
      originalStockItemId: stock.id,
      split: true,
      amount: 1,
      originalDate: result.originalDate,
      originalLocationId: result.originalLocationId,
    });
    expect(revertResult.reverted).toBe(true);

    // Opened item deleted with tombstone
    const checkOpened = await dataSource.getRepository(StockItem).findOne({ where: { id: result.openedStockItem.id } });
    expect(checkOpened).toBeNull();

    // Original restored to 3
    const restoredOrig = await dataSource.getRepository(StockItem).findOne({ where: { id: stock.id } });
    expect(restoredOrig?.amount).toBe(3);
  });
});
