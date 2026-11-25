import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { SyncService } from './sync.service.js';
import { ApiService } from './api.service.js';
import { OfflineStorageService } from './offline-storage.service.js';

describe('SyncService', () => {
  let service: SyncService;
  let api: ApiService;
  let offlineStorage: OfflineStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SyncService,
        ApiService,
        OfflineStorageService,
        provideHttpClient(),
      ],
    });
    service = TestBed.inject(SyncService);
    api = TestBed.inject(ApiService);
    offlineStorage = TestBed.inject(OfflineStorageService);
  });

  it('should initialize with online-ok or initial status', () => {
    expect(service.status()).toBeDefined();
    expect(service.pendingCount()).toBe(0);
    expect(service.lastError()).toBeNull();
  });

  it('should correctly compute lastSyncTime from lastSyncAt', () => {
    expect(service.lastSyncTime()).toBeNull();

    const nowIso = new Date().toISOString();
    service.lastSyncAt.set(nowIso);
    expect(service.lastSyncTime()).toBeInstanceOf(Date);
  });

  it('should handle downloadServerVersion by clearing queue and refreshing', async () => {
    api.activeHouseholdId.set('hh-123');
    const clearQueueSpy = vi.spyOn(offlineStorage, 'clearQueue').mockResolvedValue();
    const clearStoresSpy = vi.spyOn(offlineStorage, 'clearAllStores').mockResolvedValue();
    const syncApiSpy = vi.spyOn(api, 'sync').mockResolvedValue({
      serverTime: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      appliedChanges: {},
      conflicts: [],
      serverChanges: {},
      tombstones: [],
    } as any);

    const result = await service.downloadServerVersion();

    expect(result).toBe(true);
    expect(clearQueueSpy).toHaveBeenCalled();
    expect(clearStoresSpy).toHaveBeenCalled();
    expect(syncApiSpy).toHaveBeenCalled();
    expect(service.status()).toBe('online-ok');
  });

  it('uses per-household lastSyncAt cursors and performs full sync when upgrading from global lastSyncAt', async () => {
    await offlineStorage.setMeta('lastSyncAt', '2026-01-01T00:00:00.000Z');
    api.activeHouseholdId.set('hh-upgrade');

    const syncApiSpy = vi.spyOn(api, 'sync').mockResolvedValue({
      syncedAt: '2026-01-02T00:00:00.000Z',
      serverChanges: {
        products: Array.from({ length: 120 }, (_, i) => ({
          id: `p-${i}`,
          householdId: 'hh-upgrade',
          name: `Product ${i}`,
          active: true,
        })),
      },
      tombstones: [],
    } as any);

    const ok = await service.sync();
    expect(ok).toBe(true);
    expect(syncApiSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lastSyncAt: null,
      }),
    );

    const storedProducts = await offlineStorage.getProducts('hh-upgrade');
    expect(storedProducts.length).toBe(120);
    expect(await service.isHouseholdHydrated('hh-upgrade')).toBe(true);
    expect(await service.isHouseholdHydrated('hh-other')).toBe(false);
  });

  it('deduplicates concurrent sync calls for the same household', async () => {
    api.activeHouseholdId.set('hh-dedup');
    const syncApiSpy = vi.spyOn(api, 'sync').mockResolvedValue({
      syncedAt: '2026-01-02T00:00:00.000Z',
      serverChanges: { products: [] },
      tombstones: [],
    } as any);

    const results = await Promise.all([service.sync(), service.sync(), service.sync()]);
    expect(results).toEqual([true, true, true]);
    expect(syncApiSpy).toHaveBeenCalledTimes(1);
  });

  it('pushes queued catalog changes and applies catalog tombstones without wiping unchanged catalogs', async () => {
    api.activeHouseholdId.set('hh-cat');
    await offlineStorage.saveCatalogs(
      'hh-cat',
      {
        stores: [
          { id: 's-keep', householdId: 'hh-cat', name: 'Coop', description: null, active: true },
          { id: 's-del', householdId: 'hh-cat', name: 'Old Store', description: null, active: true },
        ],
        locations: [{ id: 'l-1', householdId: 'hh-cat', name: 'Fridge', description: null, isFreezer: false, active: true }],
      },
      { replace: true },
    );
    await offlineStorage.setMeta(service.getLastSyncKey('hh-cat'), '2026-01-01T00:00:00.000Z');
    await offlineStorage.enqueue({
      entity: 'catalog',
      action: 'create',
      payload: { type: 'store', id: 's-new', name: 'Esselunga' },
    });

    const syncApiSpy = vi.spyOn(api, 'sync').mockResolvedValue({
      syncedAt: '2026-01-02T00:00:00.000Z',
      serverChanges: {
        products: [],
        stock: [],
        shoppingListItems: [],
        shoppingLists: [],
        catalogs: { units: [], groups: [], locations: [], stores: [] },
      },
      tombstones: [{ entityType: 'store', entityId: 's-del', deletedAt: new Date() }],
    } as any);

    const ok = await service.sync();
    expect(ok).toBe(true);
    expect(syncApiSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          catalogs: expect.objectContaining({
            stores: [{ id: 's-new', name: 'Esselunga' }],
          }),
        }),
      }),
    );

    const cat = await offlineStorage.getCatalogs('hh-cat');
    expect(cat.locations.map((l) => l.id)).toEqual(['l-1']);
    expect(cat.stores.map((s) => s.id)).toEqual(['s-keep']);
  });

  it('should not notify onSyncCompleted if delta sync completes with no queue and no server changes', async () => {
    api.activeHouseholdId.set('hh-noop');
    await offlineStorage.setMeta(service.getLastSyncKey('hh-noop'), '2026-01-01T00:00:00.000Z');
    const initialCount = service.onSyncCompleted();

    vi.spyOn(api, 'sync').mockResolvedValue({
      syncedAt: '2026-01-02T00:00:00.000Z',
      serverChanges: {
        products: [],
        stock: [],
        shoppingListItems: [],
        shoppingLists: [],
        catalogs: { units: [], groups: [], locations: [], stores: [] },
      },
      tombstones: [],
    } as any);

    const ok = await service.sync();
    expect(ok).toBe(true);
    expect(service.onSyncCompleted()).toBe(initialCount);
  });

  it('should notify onSyncCompleted when delta sync receives server changes', async () => {
    api.activeHouseholdId.set('hh-changes');
    await offlineStorage.setMeta(service.getLastSyncKey('hh-changes'), '2026-01-01T00:00:00.000Z');
    const initialCount = service.onSyncCompleted();

    vi.spyOn(api, 'sync').mockResolvedValue({
      syncedAt: '2026-01-02T00:00:00.000Z',
      serverChanges: {
        catalogs: {
          units: [],
          groups: [],
          locations: [],
          stores: [{ id: 's-1', householdId: 'hh-changes', name: 'Coop', description: null, active: true }],
        },
      },
      tombstones: [],
    } as any);

    const ok = await service.sync();
    expect(ok).toBe(true);
    expect(service.onSyncCompleted()).toBe(initialCount + 1);
  });
});
