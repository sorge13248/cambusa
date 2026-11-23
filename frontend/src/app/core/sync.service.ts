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

  async refreshPendingCount(): Promise<void> {
    const queue = await this.storage.getQueue();
    this.pendingCount.set(queue.length);
  }

  async sync(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.status.set('offline');
      return false;
    }

    if (!this.api.activeHouseholdId()) {
      return true;
    }

    this.status.set('syncing');
    this.lastError.set(null);

    try {
      const queue = await this.storage.getQueue();
      const lastSync = await this.storage.getMeta('lastSyncAt');

      const payload = {
        lastSyncAt: lastSync,
        changes: {
          products: queue.filter((q) => q.entity === 'product').map((q) => q.payload),
          stock: queue.filter((q) => q.entity === 'stock').map((q) => q.payload),
          shoppingListItems: queue.filter((q) => q.entity === 'shopping_item').map((q) => q.payload),
        },
      };

      const response = await this.api.sync(payload);

      // Drain processed items from queue
      for (const item of queue) {
        await this.storage.removeQueueItem(item.id);
      }
      this.pendingCount.set(0);

      const syncedAt = response.syncedAt || new Date().toISOString();
      await this.storage.setMeta('lastSyncAt', syncedAt);
      this.lastSyncAt.set(syncedAt);
      this.status.set('online-ok');
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

    if (!this.api.activeHouseholdId()) {
      return false;
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

      const syncedAt = response.syncedAt || new Date().toISOString();
      await this.storage.setMeta('lastSyncAt', syncedAt);
      this.lastSyncAt.set(syncedAt);
      this.status.set('online-ok');
      return true;
    } catch (err: any) {
      this.status.set('error');
      this.lastError.set(err?.message || 'Download from server failed');
      return false;
    }
  }
}
