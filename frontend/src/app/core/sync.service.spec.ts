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
});
