import { Injectable } from '@angular/core';
import { compareByName } from './sorting.utils.js';
import {
  Location,
  NextResponseDto,
  Product,
  ProductGroup,
  QuantityUnit,
  ShoppingList,
  ShoppingListItem,
  StockItem,
  Store,
} from './models.js';

export interface SyncQueueItem {
  id: string;
  entity: 'product' | 'stock' | 'shopping_item' | 'shopping_list' | 'catalog';
  action: 'create' | 'update' | 'delete' | 'reorder';
  payload: any;
  createdAt: number;
}

const DB_NAME = 'cambusa_offline_v1';
const DB_VERSION = 2;

const STORE_PRODUCTS = 'products';
const STORE_STOCK = 'stock';
const STORE_SHOPPING = 'shopping_items';
const STORE_SHOPPING_LISTS = 'shopping_lists';
const STORE_QUEUE = 'sync_queue';
const STORE_META = 'meta';

@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  readonly memoryStore = {
    products: new Map<string, Product>(),
    stock: new Map<string, StockItem>(),
    shopping: new Map<string, ShoppingListItem>(),
    shoppingLists: new Map<string, ShoppingList>(),
    catalogs: new Map<
      string,
      {
        units: QuantityUnit[];
        groups: ProductGroup[];
        locations: Location[];
        stores: Store[];
      }
    >(),
    dashboard: new Map<string, NextResponseDto>(),
    queue: [] as SyncQueueItem[],
    meta: new Map<string, any>(),
  };

  private getDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
              db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_STOCK)) {
              db.createObjectStore(STORE_STOCK, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_SHOPPING)) {
              db.createObjectStore(STORE_SHOPPING, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_SHOPPING_LISTS)) {
              db.createObjectStore(STORE_SHOPPING_LISTS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_QUEUE)) {
              db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_META)) {
              db.createObjectStore(STORE_META, { keyPath: 'key' });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  // Products
  async getProducts(householdId?: string): Promise<Product[]> {
    const db = await this.getDB();
    if (!db) {
      const all = Array.from(this.memoryStore.products.values());
      return householdId ? all.filter((p) => p.householdId === householdId) : all;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PRODUCTS, 'readonly');
      const req = tx.objectStore(STORE_PRODUCTS).getAll();
      req.onsuccess = () => {
        const list: Product[] = req.result || [];
        resolve(householdId ? list.filter((p) => p.householdId === householdId) : list);
      };
      req.onerror = () => resolve([]);
    });
  }

  async getProduct(id: string): Promise<Product | null> {
    const db = await this.getDB();
    if (!db) return this.memoryStore.products.get(id) ?? null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PRODUCTS, 'readonly');
      const req = tx.objectStore(STORE_PRODUCTS).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async saveProducts(products: Product[]): Promise<void> {
    if (products.length === 0) return;

    const db = await this.getDB();
    if (!db) {
      for (const p of products) {
        const existing = this.memoryStore.products.get(p.id);
        const merged = p.stores === undefined && existing?.stores ? { ...p, stores: existing.stores } : p;
        this.memoryStore.products.set(p.id, merged);
      }
      return;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
      const store = tx.objectStore(STORE_PRODUCTS);
      for (const p of products) {
        const memExisting = this.memoryStore.products.get(p.id);
        if (p.stores === undefined) {
          const req = store.get(p.id);
          req.onsuccess = () => {
            const dbExisting = req.result as Product | undefined;
            const stores = dbExisting?.stores ?? memExisting?.stores;
            const merged = stores ? { ...p, stores } : p;
            this.memoryStore.products.set(p.id, merged);
            store.put(merged);
          };
          req.onerror = () => {
            this.memoryStore.products.set(p.id, p);
            store.put(p);
          };
        } else {
          this.memoryStore.products.set(p.id, p);
          store.put(p);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async putProduct(product: Product): Promise<void> {
    this.memoryStore.products.set(product.id, product);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
      tx.objectStore(STORE_PRODUCTS).put(product);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async deleteProduct(id: string): Promise<void> {
    this.memoryStore.products.delete(id);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
      tx.objectStore(STORE_PRODUCTS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // Stock
  async getStock(householdId?: string): Promise<StockItem[]> {
    const db = await this.getDB();
    if (!db) {
      const all = Array.from(this.memoryStore.stock.values());
      return householdId ? all.filter((s) => s.householdId === householdId) : all;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_STOCK, 'readonly');
      const req = tx.objectStore(STORE_STOCK).getAll();
      req.onsuccess = () => {
        const list: StockItem[] = req.result || [];
        resolve(householdId ? list.filter((s) => s.householdId === householdId) : list);
      };
      req.onerror = () => resolve([]);
    });
  }

  async getStockItem(id: string): Promise<StockItem | null> {
    const db = await this.getDB();
    if (!db) return this.memoryStore.stock.get(id) ?? null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_STOCK, 'readonly');
      const req = tx.objectStore(STORE_STOCK).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async saveStock(items: StockItem[]): Promise<void> {
    for (const s of items) {
      this.memoryStore.stock.set(s.id, s);
    }
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_STOCK, 'readwrite');
      const store = tx.objectStore(STORE_STOCK);
      for (const s of items) {
        store.put(s);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async putStockItem(item: StockItem): Promise<void> {
    this.memoryStore.stock.set(item.id, item);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_STOCK, 'readwrite');
      tx.objectStore(STORE_STOCK).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async deleteStockItem(id: string): Promise<void> {
    this.memoryStore.stock.delete(id);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_STOCK, 'readwrite');
      tx.objectStore(STORE_STOCK).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // Shopping Items
  async getShoppingItems(listId?: string, householdId?: string): Promise<ShoppingListItem[]> {
    const db = await this.getDB();
    if (!db) {
      let all = Array.from(this.memoryStore.shopping.values());
      if (householdId) all = all.filter((i) => i.householdId === householdId);
      if (listId) all = all.filter((i) => i.shoppingListId === listId);
      return all;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SHOPPING, 'readonly');
      const req = tx.objectStore(STORE_SHOPPING).getAll();
      req.onsuccess = () => {
        let list: ShoppingListItem[] = req.result || [];
        if (householdId) list = list.filter((i) => i.householdId === householdId);
        if (listId) list = list.filter((i) => i.shoppingListId === listId);
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  }

  async getShoppingItem(id: string): Promise<ShoppingListItem | null> {
    const db = await this.getDB();
    if (!db) return this.memoryStore.shopping.get(id) ?? null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SHOPPING, 'readonly');
      const req = tx.objectStore(STORE_SHOPPING).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async saveShoppingItems(items: ShoppingListItem[]): Promise<void> {
    for (const item of items) {
      this.memoryStore.shopping.set(item.id, item);
    }
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SHOPPING, 'readwrite');
      const store = tx.objectStore(STORE_SHOPPING);
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async putShoppingItem(item: ShoppingListItem): Promise<void> {
    this.memoryStore.shopping.set(item.id, item);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SHOPPING, 'readwrite');
      tx.objectStore(STORE_SHOPPING).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async deleteShoppingItem(id: string): Promise<void> {
    this.memoryStore.shopping.delete(id);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SHOPPING, 'readwrite');
      tx.objectStore(STORE_SHOPPING).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // Shopping Lists
  async getShoppingLists(householdId?: string): Promise<ShoppingList[]> {
    const db = await this.getDB();
    if (!db) {
      const all = Array.from(this.memoryStore.shoppingLists.values());
      const res = householdId ? all.filter((l) => l.householdId === householdId) : all;
      return res.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SHOPPING_LISTS, 'readonly');
      const req = tx.objectStore(STORE_SHOPPING_LISTS).getAll();
      req.onsuccess = () => {
        let list: ShoppingList[] = req.result || [];
        if (householdId) list = list.filter((l) => l.householdId === householdId);
        list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  }

  async getShoppingList(id: string): Promise<ShoppingList | null> {
    const db = await this.getDB();
    if (!db) return this.memoryStore.shoppingLists.get(id) ?? null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SHOPPING_LISTS, 'readonly');
      const req = tx.objectStore(STORE_SHOPPING_LISTS).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async saveShoppingLists(lists: ShoppingList[]): Promise<void> {
    for (const l of lists) {
      this.memoryStore.shoppingLists.set(l.id, l);
    }
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SHOPPING_LISTS, 'readwrite');
      const store = tx.objectStore(STORE_SHOPPING_LISTS);
      for (const l of lists) {
        store.put(l);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async putShoppingList(list: ShoppingList): Promise<void> {
    this.memoryStore.shoppingLists.set(list.id, list);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SHOPPING_LISTS, 'readwrite');
      tx.objectStore(STORE_SHOPPING_LISTS).put(list);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async deleteShoppingList(id: string): Promise<void> {
    this.memoryStore.shoppingLists.delete(id);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SHOPPING_LISTS, 'readwrite');
      tx.objectStore(STORE_SHOPPING_LISTS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // Catalogs
  async getCatalogs(householdId?: string): Promise<{
    units: QuantityUnit[];
    groups: ProductGroup[];
    locations: Location[];
    stores: Store[];
  }> {
    const key = householdId ? `catalogs_${householdId}` : 'catalogs_default';
    const cached = await this.getMeta(key);
    if (cached) {
      return {
        units: [...(cached.units || [])].sort(compareByName),
        groups: [...(cached.groups || [])].sort(compareByName),
        locations: [...(cached.locations || [])].sort(compareByName),
        stores: [...(cached.stores || [])].sort(compareByName),
      };
    }
    const mem = this.memoryStore.catalogs.get(key);
    if (mem) {
      return {
        units: [...mem.units].sort(compareByName),
        groups: [...mem.groups].sort(compareByName),
        locations: [...mem.locations].sort(compareByName),
        stores: [...mem.stores].sort(compareByName),
      };
    }
    return {
      units: [],
      groups: [],
      locations: [],
      stores: [],
    };
  }

  private mergeCatalogList<T extends { id: string; name?: string | null }>(
    existing: T[],
    incoming: T[] | undefined,
    replace: boolean,
  ): T[] {
    if (!incoming) return [...existing].sort(compareByName);
    if (replace) return [...incoming].sort(compareByName);
    if (incoming.length === 0) return [...existing].sort(compareByName);

    const map = new Map<string, T>();
    for (const item of existing) {
      map.set(item.id, item);
    }
    for (const item of incoming) {
      const prev = map.get(item.id);
      map.set(item.id, prev ? { ...prev, ...item } : item);
    }
    return Array.from(map.values()).sort(compareByName);
  }

  async saveCatalogs(
    householdId: string,
    catalogs: {
      units?: QuantityUnit[];
      groups?: ProductGroup[];
      locations?: Location[];
      stores?: Store[];
    },
    options?: { replace?: boolean },
  ): Promise<void> {
    const key = `catalogs_${householdId}`;
    const existing = await this.getCatalogs(householdId);
    const replace = Boolean(options?.replace);
    const merged = {
      units: this.mergeCatalogList(existing.units, catalogs.units, replace),
      groups: this.mergeCatalogList(existing.groups, catalogs.groups, replace),
      locations: this.mergeCatalogList(existing.locations, catalogs.locations, replace),
      stores: this.mergeCatalogList(existing.stores, catalogs.stores, replace),
    };
    this.memoryStore.catalogs.set(key, merged);
    await this.setMeta(key, merged);
  }

  async removeCatalogItem(householdId: string, entityType: string, id: string): Promise<void> {
    const cat = await this.getCatalogs(householdId);
    if (entityType === 'unit' || entityType === 'quantity_unit') {
      await this.saveCatalogs(householdId, { units: cat.units.filter((u) => u.id !== id) }, { replace: true });
    } else if (entityType === 'group' || entityType === 'product_group') {
      await this.saveCatalogs(householdId, { groups: cat.groups.filter((g) => g.id !== id) }, { replace: true });
    } else if (entityType === 'location') {
      await this.saveCatalogs(householdId, { locations: cat.locations.filter((l) => l.id !== id) }, { replace: true });
    } else if (entityType === 'store') {
      await this.saveCatalogs(householdId, { stores: cat.stores.filter((s) => s.id !== id) }, { replace: true });
    }
  }

  // Dashboard Cache
  async getDashboardData(householdId: string): Promise<NextResponseDto | null> {
    const inMem = this.memoryStore.dashboard.get(householdId);
    if (inMem) return inMem;
    const fromMeta = await this.getMeta(`dashboard_${householdId}`);
    if (fromMeta) {
      this.memoryStore.dashboard.set(householdId, fromMeta);
      return fromMeta;
    }
    return null;
  }

  async saveDashboardData(householdId: string, data: NextResponseDto): Promise<void> {
    this.memoryStore.dashboard.set(householdId, data);
    await this.setMeta(`dashboard_${householdId}`, data);
  }

  // Queue
  async enqueue(action: Omit<SyncQueueItem, 'id' | 'createdAt'>): Promise<void> {
    const item: SyncQueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...action,
      createdAt: Date.now(),
    };

    const db = await this.getDB();
    if (!db) {
      this.memoryStore.queue.push(item);
      return;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      tx.objectStore(STORE_QUEUE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async getQueue(): Promise<SyncQueueItem[]> {
    const db = await this.getDB();
    if (!db) {
      return [...this.memoryStore.queue];
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_QUEUE, 'readonly');
      const req = tx.objectStore(STORE_QUEUE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async removeQueueItem(id: string): Promise<void> {
    const db = await this.getDB();
    if (!db) {
      this.memoryStore.queue = this.memoryStore.queue.filter((q) => q.id !== id);
      return;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      tx.objectStore(STORE_QUEUE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async clearQueue(): Promise<void> {
    this.memoryStore.queue = [];
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      tx.objectStore(STORE_QUEUE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async clearAllStores(): Promise<void> {
    this.memoryStore.products.clear();
    this.memoryStore.stock.clear();
    this.memoryStore.shopping.clear();
    this.memoryStore.shoppingLists.clear();
    this.memoryStore.catalogs.clear();
    this.memoryStore.dashboard.clear();
    this.memoryStore.queue = [];
    this.memoryStore.meta.clear();

    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const stores = [
        STORE_PRODUCTS,
        STORE_STOCK,
        STORE_SHOPPING,
        STORE_SHOPPING_LISTS,
        STORE_QUEUE,
        STORE_META,
      ];
      const tx = db.transaction(stores, 'readwrite');
      for (const s of stores) {
        tx.objectStore(s).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // Meta
  async getMeta(key: string): Promise<any> {
    const db = await this.getDB();
    if (!db) return this.memoryStore.meta.get(key) ?? null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async setMeta(key: string, value: any): Promise<void> {
    this.memoryStore.meta.set(key, value);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}
