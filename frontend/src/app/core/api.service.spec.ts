import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiService } from './api.service.js';
import { OfflineStorageService } from './offline-storage.service.js';
import { SyncService } from './sync.service.js';
import { Product } from './models.js';

describe('ApiService', () => {
  let api: ApiService;
  let storage: OfflineStorageService;
  let syncService: SyncService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ApiService,
        OfflineStorageService,
        SyncService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(ApiService);
    storage = TestBed.inject(OfflineStorageService);
    syncService = TestBed.inject(SyncService);
    httpMock = TestBed.inject(HttpTestingController);

    storage.memoryStore.products.clear();
    storage.memoryStore.stock.clear();
    storage.memoryStore.shopping.clear();
    storage.memoryStore.shoppingLists.clear();
    storage.memoryStore.queue = [];
    storage.memoryStore.meta.clear();
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('does not short-circuit on partial local products when household is not hydrated', async () => {
    api.activeHouseholdId.set('hh-1');
    await storage.saveProducts([
      { id: 'p-0', householdId: 'hh-1', name: 'Item 000', active: true } as unknown as Product,
      { id: 'p-1', householdId: 'hh-1', name: 'Item 001', active: true } as unknown as Product,
    ]);

    const fullCatalog = Array.from({ length: 150 }, (_, i) => ({
      id: `p-${i}`,
      householdId: 'hh-1',
      name: `Item ${String(i).padStart(3, '0')}`,
      active: true,
      stores: [],
    })) as unknown as Product[];

    vi.spyOn(syncService, 'sync').mockImplementation(async () => {
      await storage.saveProducts(fullCatalog);
      await storage.setMeta(syncService.getLastSyncKey('hh-1'), '2026-01-01T00:00:00.000Z');
      return true;
    });

    const products = await api.getProducts(true);
    expect(products.length).toBe(150);
    expect(products[0].name).toBe('Item 000');
  });

  it('falls back to /api/products?includeInactive=true if sync fails on unhydrated household with partial local cache', async () => {
    api.activeHouseholdId.set('hh-1');
    await storage.saveProducts([
      { id: 'p-partial-1', householdId: 'hh-1', name: 'Partial 1', active: true } as Product,
    ]);

    vi.spyOn(syncService, 'sync').mockResolvedValue(false);

    const promise = api.getProducts(true);
    // Allow async storage/sync checks to reach HTTP request
    await new Promise((r) => setTimeout(r, 0));

    const req = httpMock.expectOne('/api/products?includeInactive=true');
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 'p-1', householdId: 'hh-1', name: 'Alpha', active: true },
      { id: 'p-2', householdId: 'hh-1', name: 'Beta', active: false },
      { id: 'p-3', householdId: 'hh-1', name: 'Gamma', active: true },
    ]);

    const products = await promise;
    expect(products.length).toBe(3);
  });

  it('enriches hydrated local products with ancestors, hierarchyPath, and stock counts', async () => {
    api.activeHouseholdId.set('hh-1');
    await storage.setMeta(syncService.getLastSyncKey('hh-1'), '2026-01-01T00:00:00.000Z');
    await storage.saveProducts([
      {
        id: 'parent-1',
        householdId: 'hh-1',
        name: 'Pasta',
        parentProductId: null,
        active: true,
        stores: [],
      } as unknown as Product,
      {
        id: 'child-1',
        householdId: 'hh-1',
        name: 'Spaghetti',
        parentProductId: 'parent-1',
        active: true,
        stores: [],
      } as unknown as Product,
    ]);
    await storage.saveStock([
      { id: 's-1', householdId: 'hh-1', productId: 'child-1', amount: 4 } as any,
    ]);
    vi.spyOn(syncService, 'sync').mockResolvedValue(true);

    const products = await api.getProducts(true);
    expect(products.length).toBe(2);
    const parent = products.find((p) => p.id === 'parent-1')!;
    const child = products.find((p) => p.id === 'child-1')!;
    expect(parent.directStockAmount).toBe(0);
    expect(parent.aggregatedStockAmount).toBe(4);
    expect(child.ancestors).toEqual([{ id: 'parent-1', name: 'Pasta' }]);
    expect(child.hierarchyPath).toBe('Pasta > Spaghetti');
    expect(child.directStockAmount).toBe(4);
  });

  it('enriches hydrated local stock items with productName, quName, and locationName', async () => {
    api.activeHouseholdId.set('hh-1');
    await storage.setMeta(syncService.getLastSyncKey('hh-1'), '2026-01-01T00:00:00.000Z');
    await storage.saveProducts([
      {
        id: 'p-1',
        householdId: 'hh-1',
        name: 'Coffee Beans',
        quStockId: 'u-1',
        productGroupId: 'g-1',
        pictureFileNames: ['coffee.webp'],
        active: true,
      } as unknown as Product,
    ]);
    await storage.saveCatalogs('hh-1', {
      units: [{ id: 'u-1', householdId: 'hh-1', name: 'bag', namePlural: 'bags', description: null, active: true }],
      locations: [{ id: 'l-1', householdId: 'hh-1', name: 'Pantry', description: null, isFreezer: false, active: true }],
      groups: [],
      stores: [],
    });
    await storage.saveStock([
      { id: 's-1', householdId: 'hh-1', productId: 'p-1', locationId: 'l-1', amount: 2, isOpen: false } as any,
    ]);
    vi.spyOn(syncService, 'sync').mockResolvedValue(true);

    const stock = await api.getStock();
    expect(stock.length).toBe(1);
    expect(stock[0].productName).toBe('Coffee Beans');
    expect(stock[0].quName).toBe('bag');
    expect(stock[0].locationName).toBe('Pantry');
    expect(stock[0].productPictureFileName).toBe('coffee.webp');
    expect(stock[0].productGroupId).toBe('g-1');
  });

  it('includes productPictureFileName in computeNextDataLocally and refreshes legacy dashboard cache', async () => {
    api.activeHouseholdId.set('hh-1');
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const products = [
      {
        id: 'p-1',
        householdId: 'hh-1',
        name: 'Organic Milk',
        pictureFileNames: ['milk.webp'],
        active: true,
      } as unknown as Product,
      {
        id: 'p-2',
        householdId: 'hh-1',
        name: 'Plain Yogurt',
        pictureFileNames: [],
        active: true,
      } as unknown as Product,
    ];
    const stock = [
      { id: 's-1', householdId: 'hh-1', productId: 'p-1', amount: 1, bestBeforeDate: yesterday, isOpen: false } as any,
      { id: 's-2', householdId: 'hh-1', productId: 'p-2', amount: 2, bestBeforeDate: tomorrow, isOpen: false } as any,
    ];

    const computed = api.computeNextDataLocally(stock, products, 5);
    expect(computed.expired[0].productPictureFileName).toBe('milk.webp');
    expect(computed.expiringSoon[0].productPictureFileName).toBeNull();

    // Seed legacy cached dashboard payload without productPictureFileName field
    await storage.saveProducts(products);
    await storage.saveStock(stock);
    await storage.saveDashboardData('hh-1', {
      summary: computed.summary,
      expired: [{ id: 's-1', productId: 'p-1', productName: 'Organic Milk', amount: 1, quantityUnit: 'units', location: 'Fridge', bestBeforeDate: yesterday, isOpened: false, daysOverdue: 1 }],
      expiringSoon: [],
      household: { id: 'hh-1', name: 'Home' },
      generatedAt: new Date().toISOString(),
    });
    vi.spyOn(syncService, 'sync').mockResolvedValue(true);

    const nextData = await api.getNext();
    expect(nextData.expired[0].productPictureFileName).toBe('milk.webp');
    expect(nextData.expiringSoon[0].productPictureFileName).toBeNull();
  });

  it('returns aisles sorted numerically by user-defined sortOrder', async () => {
    api.activeHouseholdId.set('hh-aisles');

    const promise = api.getStoreAisles('store-1');
    await new Promise((r) => setTimeout(r, 0));

    const req = httpMock.expectOne('/api/catalogs/stores/store-1/aisles');
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 'a10', householdId: 'hh-aisles', storeId: 'store-1', name: 'Frozen', sortOrder: 10 },
      { id: 'a2', householdId: 'hh-aisles', storeId: 'store-1', name: 'Bakery', sortOrder: 2 },
      { id: 'a1', householdId: 'hh-aisles', storeId: 'store-1', name: 'Produce', sortOrder: 1 },
    ]);

    const aisles = await promise;
    expect(aisles.map((a) => a.sortOrder)).toEqual([1, 2, 10]);
  });

  it('enriches hydrated local shopping items with productName, quName, picture, aisle, price, and currentStock', async () => {
    api.activeHouseholdId.set('hh-shop');
    await storage.setMeta(syncService.getLastSyncKey('hh-shop'), '2026-01-01T00:00:00.000Z');
    await storage.saveShoppingLists([
      { id: 'list-1', householdId: 'hh-shop', name: 'Coop', storeId: 'store-1', isDefault: true, sortOrder: 0 },
    ]);
    await storage.saveProducts([
      {
        id: 'p-1',
        householdId: 'hh-shop',
        name: 'Extra Virgin Olive Oil',
        quPurchaseId: 'u-1',
        quStockId: 'u-1',
        minStockAmount: 2,
        pictureFileNames: ['oil.webp'],
        stores: [
          { productId: 'p-1', storeId: 'store-1', aisle: 'Condiments', aisleOrder: 3, averagePrice: 5.98, isPreferred: true },
        ],
        active: true,
      } as unknown as Product,
    ]);
    await storage.saveCatalogs('hh-shop', {
      units: [{ id: 'u-1', householdId: 'hh-shop', name: 'bottle', namePlural: 'bottles', description: null, active: true }],
      locations: [],
      groups: [],
      stores: [{ id: 'store-1', householdId: 'hh-shop', name: 'Coop', description: null, active: true }],
    });
    await storage.saveStock([
      { id: 's-1', householdId: 'hh-shop', productId: 'p-1', amount: 1, bestBeforeDate: '2026-12-31', isOpen: false } as any,
    ]);
    await storage.saveShoppingItems([
      { id: 'si-1', householdId: 'hh-shop', shoppingListId: 'list-1', productId: 'p-1', amount: 2, done: false } as any,
      { id: 'si-2', householdId: 'hh-shop', shoppingListId: 'list-1', productId: null, customName: 'Paper Towels', amount: 1, done: false } as any,
    ]);
    vi.spyOn(syncService, 'sync').mockResolvedValue(true);

    const items = await api.getShoppingItems('list-1', 'store-1');
    expect(items.length).toBe(2);

    const oil = items.find((i) => i.id === 'si-1')!;
    expect(oil.productName).toBe('Extra Virgin Olive Oil');
    expect(oil.quName).toBe('bottle');
    expect(oil.productPictureFileName).toBe('oil.webp');
    expect(oil.aisle).toBe('Condiments');
    expect(oil.aisleOrder).toBe(3);
    expect(oil.estimatedPrice).toBeCloseTo(11.96);
    expect(oil.currentStock).toBe(1);
    expect(oil.minStockAmount).toBe(2);
    expect(oil.earliestExpirationDate).toBe('2026-12-31');
    expect(oil.storeName).toBe('Coop');

    const custom = items.find((i) => i.id === 'si-2')!;
    expect(custom.productName).toBe('Paper Towels');
    expect(custom.aisle).toBeNull();
    // Aisle items sort before unspecified aisle items
    expect(items[0].id).toBe('si-1');
  });
});
