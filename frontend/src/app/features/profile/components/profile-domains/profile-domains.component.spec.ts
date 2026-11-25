import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { Dialog, DialogModule } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ProfileDomainsComponent } from './profile-domains.component.js';
import { ApiService } from '../../../../core/api.service.js';
import { SyncService } from '../../../../core/sync.service.js';

describe('ProfileDomainsComponent', () => {
  let component: ProfileDomainsComponent;
  let fixture: ComponentFixture<ProfileDomainsComponent>;
  let apiService: ApiService;
  let dialog: Dialog;

  const mockStores = [
    { id: 's1', name: 'Coop', description: 'Local supermarket', householdId: 'h1', createdAt: '', updatedAt: '' },
  ];

  const mockAisles = [
    { id: 'a1', storeId: 's1', name: 'Produce', sortOrder: 1, householdId: 'h1', createdAt: '', updatedAt: '' },
    { id: 'a2', storeId: 's1', name: 'Dairy', sortOrder: 2, householdId: 'h1', createdAt: '', updatedAt: '' },
  ];

  const mockSyncService = {
    onSyncCompleted: signal(0),
  };

  beforeEach(async () => {
    mockSyncService.onSyncCompleted.set(0);
    await TestBed.configureTestingModule({
      imports: [ProfileDomainsComponent, DialogModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SyncService, useValue: mockSyncService },
        {
          provide: ApiService,
          useValue: {
            getStores: vi.fn().mockResolvedValue(mockStores),
            createStore: vi.fn().mockResolvedValue({ id: 's2', name: 'Esselunga' }),
            updateStore: vi.fn().mockResolvedValue({ id: 's1', name: 'Coop Superstore' }),
            deleteStore: vi.fn().mockResolvedValue(undefined),
            getStoreAisles: vi.fn().mockResolvedValue(mockAisles),
            createAisle: vi.fn().mockResolvedValue({ id: 'a3', storeId: 's1', name: 'Bakery', sortOrder: 3 }),
            updateAisle: vi.fn().mockResolvedValue({ id: 'a1', storeId: 's1', name: 'Fresh Produce' }),
            deleteAisle: vi.fn().mockResolvedValue(undefined),
            reorderStoreAisles: vi.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileDomainsComponent);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService);
    dialog = TestBed.inject(Dialog);
    fixture.detectChanges();
  });

  it('should create and load stores on init', async () => {
    expect(component).toBeTruthy();
    await fixture.whenStable();
    expect(apiService.getStores).toHaveBeenCalled();
    expect(component.stores().length).toBe(1);
    expect(component.selectedAisleStoreId()).toBe('s1');
  });

  it('should create new store', async () => {
    component.openAddStoreModal();
    expect(component.isStoreModalOpen()).toBe(true);

    component.storeName.set('Esselunga');
    component.storeDescription.set('Downtown');

    await component.saveStore();

    expect(apiService.createStore).toHaveBeenCalledWith({
      name: 'Esselunga',
      description: 'Downtown',
    });
    expect(component.isStoreModalOpen()).toBe(false);
  });

  it('should add aisle to selected store', async () => {
    component.selectedAisleStoreId.set('s1');
    component.newAisleName.set('Bakery');

    await component.addAisle();

    expect(apiService.createAisle).toHaveBeenCalledWith('s1', { name: 'Bakery' });
    expect(component.currentStoreAisles().some((a) => a.name === 'Bakery')).toBe(true);
    expect(component.newAisleName()).toBe('');
  });

  it('should delete store when confirmed', async () => {
    vi.spyOn(dialog, 'open').mockReturnValue({
      closed: of(true),
    } as any);

    await component.deleteStore('s1');

    expect(apiService.deleteStore).toHaveBeenCalledWith('s1');
  });

  it('sorts stores alphabetically and aisles numerically by sortOrder', async () => {
    vi.spyOn(apiService, 'getStores').mockResolvedValue([
      { id: 's2', name: 'Zeta', description: null, householdId: 'h1', active: true } as any,
      { id: 's1', name: 'aldi', description: null, householdId: 'h1', active: true } as any,
    ]);
    vi.spyOn(apiService, 'getStoreAisles').mockResolvedValue([
      { id: 'a10', storeId: 's1', name: 'Ten', sortOrder: 10, householdId: 'h1' } as any,
      { id: 'a2', storeId: 's1', name: 'Two', sortOrder: 2, householdId: 'h1' } as any,
      { id: 'a1', storeId: 's1', name: 'One', sortOrder: 1, householdId: 'h1' } as any,
    ]);

    await component.loadStores();
    expect(component.stores().map((s) => s.name)).toEqual(['aldi', 'Zeta']);

    await component.loadStoreAisles('s1');
    expect(component.currentStoreAisles().map((a) => a.sortOrder)).toEqual([1, 2, 10]);
  });

  it('reloads stores when sync completes', async () => {
    await fixture.whenStable();
    vi.clearAllMocks();

    mockSyncService.onSyncCompleted.update((c) => c + 1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(apiService.getStores).toHaveBeenCalled();
  });
});
