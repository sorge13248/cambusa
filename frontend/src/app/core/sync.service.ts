import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service.js';
import { OfflineStorageService } from './offline-storage.service.js';

export type SyncStatus = 'online-ok' | 'syncing' | 'offline' | 'error' | 'conflict';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(OfflineStorageService);

  readonly status = signal<SyncStatus>('online-ok');
  readonly lastSyncAt = signal<string | null>(null);
  readonly pendingCount = signal<number>(0);
  readonly lastError = signal<string | null>(null);
  readonly conflicts = signal<number>(0);
  readonly onSyncCompleted = signal<number>(0);

  private inFlightSync: { householdId: string; promise: Promise<boolean> } | null = null;

  readonly lastSyncTime = computed<Date | null>(() => {
    const iso = this.lastSyncAt();
    return iso ? new Date(iso) : null;
  });

  readonly isOnline = computed<boolean>(() => {
    return this.status() !== 'offline';
  });

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.status.set('online-ok');
        this.sync();
      });
      window.addEventListener('offline', () => this.status.set('offline'));
    }
    // Initialize lastSyncAt from meta storage
    this.storage.getMeta('lastSyncAt').then((val) => {
      if (val) this.lastSyncAt.set(val);
    });
    this.refreshPendingCount();
  }

  getLastSyncKey(householdId: string): string {
    return `lastSyncAt_v2_${householdId}`;
  }

  async isHouseholdHydrated(householdId?: string): Promise<boolean> {
    if (!householdId) return false;
    const val = await this.storage.getMeta(this.getLastSyncKey(householdId));
    return Boolean(val);
  }

  notifyDataRefreshed(): void {
    this.onSyncCompleted.update((c) => c + 1);
  }

  async refreshPendingCount(): Promise<void> {
    const queue = await this.storage.getQueue();
    this.pendingCount.set(queue.length);
  }

  async sync(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.status.set('offline');
      return false;
    }

    const hhId = this.api.activeHouseholdId();
    if (!hhId) {
      return true;
    }

    if (this.inFlightSync) {
      if (this.inFlightSync.householdId === hhId) {
        return this.inFlightSync.promise;
      }
      await this.inFlightSync.promise.catch(() => {});
    }

    const promise = this.performSync(hhId).finally(() => {
      if (this.inFlightSync?.promise === promise) {
        this.inFlightSync = null;
      }
    });
    this.inFlightSync = { householdId: hhId, promise };
    return promise;
  }

  private async performSync(hhId: string): Promise<boolean> {
    this.status.set('syncing');
    this.lastError.set(null);

    try {
      const queue = await this.storage.getQueue();
      const lastSyncKey = this.getLastSyncKey(hhId);
      const lastSync = await this.storage.getMeta(lastSyncKey);

      const deletions = queue
        .filter((q) => q.action === 'delete')
        .map((q) => ({
          entityType: q.entity === 'catalog' ? q.payload?.type : q.entity,
          entityId: q.payload?.id || q.payload,
        }))
        .filter((d) => Boolean(d.entityType && d.entityId));

      const catalogQueue = queue.filter((q) => q.entity === 'catalog' && q.action !== 'delete');
      const stripCatalogType = (itemPayload: any) => {
        const { type: _type, ...rest } = itemPayload || {};
        return rest;
      };
      const catalogsPayload = {
        units: catalogQueue.filter((q) => q.payload?.type === 'unit').map((q) => stripCatalogType(q.payload)),
        groups: catalogQueue.filter((q) => q.payload?.type === 'group').map((q) => stripCatalogType(q.payload)),
        locations: catalogQueue.filter((q) => q.payload?.type === 'location').map((q) => stripCatalogType(q.payload)),
        stores: catalogQueue.filter((q) => q.payload?.type === 'store').map((q) => stripCatalogType(q.payload)),
      };
      const hasCatalogChanges =
        catalogsPayload.units.length > 0 ||
        catalogsPayload.groups.length > 0 ||
        catalogsPayload.locations.length > 0 ||
        catalogsPayload.stores.length > 0;

      const payload = {
        lastSyncAt: lastSync,
        changes: {
          products: queue.filter((q) => q.entity === 'product' && q.action !== 'delete').map((q) => q.payload),
          stock: queue.filter((q) => q.entity === 'stock' && q.action !== 'delete').map((q) => q.payload),
          shoppingListItems: queue
            .filter((q) => q.entity === 'shopping_item' && q.action !== 'delete')
            .map((q) => q.payload),
          shoppingLists: queue
            .filter((q) => q.entity === 'shopping_list' && q.action !== 'delete')
            .flatMap((q) => (Array.isArray(q.payload) ? q.payload : [q.payload])),
          catalogs: hasCatalogChanges ? catalogsPayload : undefined,
          deletions: deletions.length > 0 ? deletions : undefined,
        },
      };

      const response = await this.api.sync(payload);

      // Drain only the items that were part of this sync batch
      for (const item of queue) {
        await this.storage.removeQueueItem(item.id);
      }
      await this.refreshPendingCount();

      // Ingest server changes into local IndexedDB stores
      if (response.serverChanges) {
        if (response.serverChanges.products && response.serverChanges.products.length > 0) {
          await this.storage.saveProducts(response.serverChanges.products);
        }
        if (response.serverChanges.stock && response.serverChanges.stock.length > 0) {
          await this.storage.saveStock(response.serverChanges.stock);
        }
        if (response.serverChanges.shoppingListItems && response.serverChanges.shoppingListItems.length > 0) {
          await this.storage.saveShoppingItems(response.serverChanges.shoppingListItems);
        }
        if (response.serverChanges.shoppingLists && response.serverChanges.shoppingLists.length > 0) {
          await this.storage.saveShoppingLists(response.serverChanges.shoppingLists);
          await this.storage.setMeta(`shopping_lists_${hhId}`, response.serverChanges.shoppingLists);
        }
        if (response.serverChanges.catalogs) {
          await this.storage.saveCatalogs(hhId, response.serverChanges.catalogs, {
            replace: !lastSync,
          });
        }
      }

      // Reconcile tombstones (deletions from other clients or server)
      if (response.tombstones && response.tombstones.length > 0) {
        for (const t of response.tombstones) {
          const type = t.entityType;
          const id = t.entityId;
          if (type === 'stock' || type === 'stock_item') {
            await this.storage.deleteStockItem(id);
          } else if (type === 'product') {
            await this.storage.deleteProduct(id);
          } else if (type === 'shopping_item') {
            await this.storage.deleteShoppingItem(id);
          } else if (type === 'shopping_list') {
            await this.storage.deleteShoppingList(id);
          } else if (
            type === 'unit' ||
            type === 'quantity_unit' ||
            type === 'group' ||
            type === 'product_group' ||
            type === 'location' ||
            type === 'store'
          ) {
            await this.storage.removeCatalogItem(hhId, type, id);
          }
        }
      }

      const syncedAt = response.syncedAt || new Date().toISOString();
      await this.storage.setMeta(lastSyncKey, syncedAt);
      await this.storage.setMeta('lastSyncAt', syncedAt);
      this.lastSyncAt.set(syncedAt);
      this.status.set('online-ok');
      this.onSyncCompleted.update((c) => c + 1);
      return true;
    } catch (err: any) {
      this.status.set('error');
      this.lastError.set(err?.message || 'Sync failed');
      return false;
    }
  }

  async downloadServerVersion(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.status.set('offline');
      return false;
    }

    const hhId = this.api.activeHouseholdId();
    if (!hhId) {
      return false;
    }

    if (this.inFlightSync) {
      await this.inFlightSync.promise.catch(() => {});
    }

    this.status.set('syncing');
    this.lastError.set(null);

    try {
      await this.storage.clearQueue();
      await this.storage.clearAllStores();
      this.pendingCount.set(0);

      const payload = {
        lastSyncAt: null,
        changes: {},
      };

      const response = await this.api.sync(payload);

      if (response.serverChanges) {
        if (response.serverChanges.products) {
          await this.storage.saveProducts(response.serverChanges.products);
        }
        if (response.serverChanges.stock) {
          await this.storage.saveStock(response.serverChanges.stock);
        }
        if (response.serverChanges.shoppingListItems) {
          await this.storage.saveShoppingItems(response.serverChanges.shoppingListItems);
        }
        if (response.serverChanges.shoppingLists) {
          await this.storage.saveShoppingLists(response.serverChanges.shoppingLists);
          await this.storage.setMeta(`shopping_lists_${hhId}`, response.serverChanges.shoppingLists);
        }
        if (response.serverChanges.catalogs) {
          await this.storage.saveCatalogs(hhId, response.serverChanges.catalogs, { replace: true });
        }
      }

      const syncedAt = response.syncedAt || new Date().toISOString();
      await this.storage.setMeta(this.getLastSyncKey(hhId), syncedAt);
      await this.storage.setMeta('lastSyncAt', syncedAt);
      this.lastSyncAt.set(syncedAt);
      this.status.set('online-ok');
      this.onSyncCompleted.update((c) => c + 1);
      return true;
    } catch (err: any) {
      this.status.set('error');
      this.lastError.set(err?.message || 'Download from server failed');
      return false;
    }
  }
}
