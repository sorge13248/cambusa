import { Injectable } from '@angular/core';
import { Product, ShoppingListItem, StockItem } from './models.js';

export interface SyncQueueItem {
  id: string;
  entity: 'product' | 'stock' | 'shopping_item' | 'shopping_list';
  action: 'create' | 'update' | 'delete' | 'reorder';
  payload: any;
  createdAt: number;
}

const DB_NAME = 'cambusa_offline_v1';
const DB_VERSION = 1;

const STORE_PRODUCTS = 'products';
const STORE_STOCK = 'stock';
const STORE_SHOPPING = 'shopping_items';
const STORE_QUEUE = 'sync_queue';
const STORE_META = 'meta';

@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly memoryStore = {
    products: new Map<string, Product>(),
    stock: new Map<string, StockItem>(),
    shopping: new Map<string, ShoppingListItem>(),
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
    this.memoryStore.queue = [];
    this.memoryStore.meta.clear();

    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const stores = [STORE_PRODUCTS, STORE_STOCK, STORE_SHOPPING, STORE_QUEUE, STORE_META];
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
    const db = await this.getDB();
    if (!db) {
      this.memoryStore.meta.set(key, value);
      return;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}
