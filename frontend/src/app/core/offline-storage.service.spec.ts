import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { OfflineStorageService } from './offline-storage.service.js';
import { Product, StockItem, ShoppingListItem, ShoppingList } from './models.js';

describe('OfflineStorageService', () => {
  let service: OfflineStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OfflineStorageService],
    });
    service = TestBed.inject(OfflineStorageService);
    service.memoryStore.products.clear();
    service.memoryStore.stock.clear();
    service.memoryStore.shopping.clear();
    service.memoryStore.shoppingLists.clear();
    service.memoryStore.queue = [];
    service.memoryStore.meta.clear();
  });

  it('stores and retrieves products in memory store fallback', async () => {
    const prod: Product = {
      id: 'p-1',
      name: 'Organic Milk',
      householdId: 'hh-1',
    } as Product;

    await service.putProduct(prod);
    const retrieved = await service.getProduct('p-1');
    expect(retrieved?.name).toBe('Organic Milk');

    const list = await service.getProducts('hh-1');
    expect(list.length).toBe(1);

    await service.deleteProduct('p-1');
    const empty = await service.getProduct('p-1');
    expect(empty).toBeNull();
  });

  it('stores and retrieves stock items', async () => {
    const stock: StockItem = {
      id: 's-1',
      productId: 'p-1',
      amount: 3,
      householdId: 'hh-1',
    } as StockItem;

    await service.putStockItem(stock);
    const retrieved = await service.getStockItem('s-1');
    expect(retrieved?.amount).toBe(3);

    const all = await service.getStock('hh-1');
    expect(all.length).toBe(1);

    await service.deleteStockItem('s-1');
    const empty = await service.getStockItem('s-1');
    expect(empty).toBeNull();
  });

  it('enqueues and drains sync queue items', async () => {
    await service.enqueue({
      entity: 'stock',
      action: 'create',
      payload: { id: 's-1', amount: 2 },
    });

    const queue = await service.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].entity).toBe('stock');

    await service.removeQueueItem(queue[0].id);
    const empty = await service.getQueue();
    expect(empty.length).toBe(0);
  });

  it('manages shopping lists and items', async () => {
    const list: ShoppingList = {
      id: 'l-1',
      name: 'Groceries',
      householdId: 'hh-1',
      sortOrder: 0,
    } as ShoppingList;

    await service.putShoppingList(list);
    const lists = await service.getShoppingLists('hh-1');
    expect(lists.length).toBe(1);

    const item: ShoppingListItem = {
      id: 'item-1',
      shoppingListId: 'l-1',
      productName: 'Apples',
      amount: 5,
      done: false,
      householdId: 'hh-1',
    } as ShoppingListItem;

    await service.putShoppingItem(item);
    const items = await service.getShoppingItems('l-1', 'hh-1');
    expect(items.length).toBe(1);
    expect(items[0].productName).toBe('Apples');
  });

  it('manages dashboard data cache', async () => {
    const mockData = {
      summary: {
        expiredCount: 0,
        expiringSoonCount: 1,
        totalUniqueProductsInStock: 5,
        totalStockItems: 10,
        configuredDays: 5,
      },
      expired: [],
      expiringSoon: [],
      generatedAt: new Date().toISOString(),
    } as any;

    await service.saveDashboardData('hh-1', mockData);
    const retrieved = await service.getDashboardData('hh-1');
    expect(retrieved?.summary.totalStockItems).toBe(10);

    await service.invalidateDashboardData('hh-1');
    const cleared = await service.getDashboardData('hh-1');
    expect(cleared).toBeNull();
  });

  it('preserves existing catalogs when incremental sync returns empty arrays and merges partial updates by id', async () => {
    await service.saveCatalogs(
      'hh-1',
      {
        units: [{ id: 'u1', householdId: 'hh-1', name: 'Piece', namePlural: 'Pieces', description: null, active: true }],
        groups: [{ id: 'g1', householdId: 'hh-1', name: 'Dairy', description: null, active: true }],
        locations: [{ id: 'l1', householdId: 'hh-1', name: 'Fridge', description: null, isFreezer: false, active: true }],
        stores: [{ id: 's1', householdId: 'hh-1', name: 'Coop', description: null, active: true }],
      },
      { replace: true },
    );

    // Simulate incremental sync returning empty arrays for unchanged catalogs
    await service.saveCatalogs('hh-1', {
      units: [],
      groups: [],
      locations: [{ id: 'l2', householdId: 'hh-1', name: 'Pantry', description: null, isFreezer: false, active: true }],
      stores: [],
    });

    const cat = await service.getCatalogs('hh-1');
    expect(cat.units.map((u) => u.id)).toEqual(['u1']);
    expect(cat.groups.map((g) => g.id)).toEqual(['g1']);
    expect(cat.locations.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(cat.stores.map((s) => s.id)).toEqual(['s1']);

    await service.removeCatalogItem('hh-1', 'location', 'l1');
    const afterDelete = await service.getCatalogs('hh-1');
    expect(afterDelete.locations.map((l) => l.id)).toEqual(['l2']);
  });

  it('always returns units, groups, locations, and stores sorted alphabetically by name', async () => {
    await service.saveCatalogs(
      'hh-sort',
      {
        units: [
          { id: 'u2', householdId: 'hh-sort', name: 'Piece', namePlural: 'Pieces', description: null, active: true },
          { id: 'u1', householdId: 'hh-sort', name: 'bag', namePlural: 'bags', description: null, active: true },
        ],
        groups: [
          { id: 'g2', householdId: 'hh-sort', name: 'Snacks', description: null, active: true },
          { id: 'g1', householdId: 'hh-sort', name: 'bakery', description: null, active: true },
        ],
        locations: [
          { id: 'l2', householdId: 'hh-sort', name: 'Pantry', description: null, isFreezer: false, active: true },
          { id: 'l1', householdId: 'hh-sort', name: 'cellar', description: null, isFreezer: false, active: true },
        ],
        stores: [
          { id: 's2', householdId: 'hh-sort', name: 'Esselunga', description: null, active: true },
          { id: 's1', householdId: 'hh-sort', name: 'aldi', description: null, active: true },
        ],
      },
      { replace: true },
    );

    const cat = await service.getCatalogs('hh-sort');
    expect(cat.units.map((u) => u.name)).toEqual(['bag', 'Piece']);
    expect(cat.groups.map((g) => g.name)).toEqual(['bakery', 'Snacks']);
    expect(cat.locations.map((l) => l.name)).toEqual(['cellar', 'Pantry']);
    expect(cat.stores.map((s) => s.name)).toEqual(['aldi', 'Esselunga']);
  });
});
