import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShoppingComponent } from './shopping.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { OfflineStorageService } from '../../core/offline-storage.service.js';
import { SyncService } from '../../core/sync.service.js';
import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';

describe('ShoppingComponent', () => {
  let component: ShoppingComponent;
  let fixture: ComponentFixture<ShoppingComponent>;

  const mockApiService = {
    getShoppingLists: vi.fn().mockResolvedValue([
      { id: 'l1', name: 'Main List', isDefault: true },
      { id: 'l2', name: 'Secondary List', isDefault: false },
    ]),
    getProducts: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Apples' }]),
    getProduct: vi.fn().mockResolvedValue({ id: 'p1', name: 'Apples' }),
    getLocations: vi.fn().mockResolvedValue([]),
    getUnits: vi.fn().mockResolvedValue([]),
    getGroups: vi.fn().mockResolvedValue([]),
    getProductGroups: vi.fn().mockResolvedValue([]),
    getStores: vi.fn().mockResolvedValue([]),
    getMissingProducts: vi.fn().mockResolvedValue([]),
    getShoppingItems: vi.fn().mockResolvedValue([
      { id: 'i1', productId: 'p1', productName: 'Apples', amount: 3, done: false, aisle: 'Fruits' },
    ]),
    toggleShoppingItemDone: vi.fn().mockResolvedValue(undefined),
    deleteShoppingItem: vi.fn().mockResolvedValue(undefined),
    addShoppingItem: vi.fn().mockResolvedValue({ id: 'i2' }),
    reorderShoppingItems: vi.fn().mockResolvedValue(undefined),
    reorderShoppingLists: vi.fn().mockResolvedValue(undefined),
  };

  const mockAuthService = {
    activeHouseholdId: signal('h1'),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  const mockOfflineStorage = {
    setMeta: vi.fn().mockResolvedValue(undefined),
    getMeta: vi.fn().mockResolvedValue(null),
    enqueue: vi.fn().mockResolvedValue(undefined),
  };

  const mockSyncService = {
    sync: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: mockApiService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: OfflineStorageService, useValue: mockOfflineStorage },
        { provide: SyncService, useValue: mockSyncService },
        { provide: Dialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShoppingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load shopping list and items', () => {
    expect(component).toBeTruthy();
    expect(mockApiService.getShoppingLists).toHaveBeenCalled();
    expect(component.shoppingLists().length).toBe(2);
    expect(component.selectedListId()).toBe('l1');
    expect(component.items().length).toBe(1);
  });

  it('should group items by aisle correctly', () => {
    const groups = component.aisleGroups();
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('Fruits');
    expect(groups[0].items.length).toBe(1);
    expect(groups[0].isUnspecified).toBe(false);
  });

  it('should include unspecified aisle only when items lack aisle', () => {
    component.items.set([
      { id: 'i1', productId: 'p1', productName: 'Apples', amount: 3, done: false, aisle: 'Fruits' } as any,
      { id: 'i2', productId: 'p2', productName: 'Toothpaste', amount: 1, done: false } as any,
    ]);
    const groups = component.aisleGroups();
    expect(groups.length).toBe(2);
    expect(groups.some((g) => g.isUnspecified && (g.name === 'Unspecified Aisle' || g.name === 'Items'))).toBe(true);
  });

  it('should label unspecified group as "Unspecified Aisle" when list has store and "Items" when list has no store', () => {
    component.shoppingLists.set([
      { id: 'l1', name: 'Coop', storeId: 'store-1', isDefault: true, householdId: 'h1', sortOrder: 0 },
    ]);
    component.selectedListId.set('l1');
    component.items.set([
      { id: 'i2', productId: 'p2', productName: 'Toothpaste', amount: 1, done: false } as any,
    ]);
    let groups = component.aisleGroups();
    expect(groups[0].name).toBe('Unspecified Aisle');

    component.shoppingLists.set([
      { id: 'l2', name: 'General', storeId: null, isDefault: true, householdId: 'h1', sortOrder: 0 },
    ]);
    component.selectedListId.set('l2');
    groups = component.aisleGroups();
    expect(groups[0].name).toBe('Items');
  });

  it('should synchronize selectedStoreId with active list storeId on selectList', () => {
    component.shoppingLists.set([
      { id: 'l1', name: 'Coop', storeId: 'store-1', isDefault: true, householdId: 'h1', sortOrder: 0 },
      { id: 'l2', name: 'General', storeId: null, isDefault: false, householdId: 'h1', sortOrder: 1 },
    ]);

    component.selectList('l1', false);
    expect(component.selectedStoreId).toBe('store-1');

    component.selectList('l2', false);
    expect(component.selectedStoreId).toBe('');
  });

  it('should toggle item done state non-destructively', async () => {
    expect(component.items()[0].done).toBe(false);
    await component.toggleDone('i1');
    expect(component.items()[0].done).toBe(true);
    expect(mockApiService.toggleShoppingItemDone).toHaveBeenCalledWith('i1');
  });

  it('should quick add item', async () => {
    component.newItemName = 'Apples';
    component.newItemAmount = 4;
    await component.quickAddItem();
    expect(mockApiService.addShoppingItem).toHaveBeenCalledWith(
      expect.objectContaining({
        customName: 'Apples',
        amount: 4,
      }),
    );
  });

  it('should open product editor modal when openEditProductModal is called', async () => {
    mockDialog.open.mockReturnValue({
      closed: of({ product: { id: 'p1', name: 'Apples' } }),
    });

    await component.openEditProductModal('p1');
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('should call reorderShoppingItems on item drop', async () => {
    const group: any = {
      name: 'Fruits',
      isUnspecified: false,
      order: 0,
      items: [
        { id: 'i1', productId: 'p1', productName: 'Apples', amount: 3, done: false, aisle: 'Fruits' },
        { id: 'i2', productId: 'p2', productName: 'Bananas', amount: 2, done: false, aisle: 'Fruits' },
      ],
    };
    component.items.set(group.items);

    await component.onItemDrop(
      { previousIndex: 0, currentIndex: 1 } as any,
      group,
    );

    expect(mockApiService.reorderShoppingItems).toHaveBeenCalledWith(['i2', 'i1']);
  });

  it('should reorder shopping lists offline-first and trigger sync', async () => {
    const tabs = [
      { id: 'l2', label: 'Secondary List' },
      { id: 'l1', label: 'Main List' },
    ];

    await component.onShoppingListsReordered(tabs as any);

    expect(mockOfflineStorage.setMeta).toHaveBeenCalled();
    expect(mockOfflineStorage.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'shopping_list',
        action: 'update',
      }),
    );
    expect(mockApiService.reorderShoppingLists).toHaveBeenCalledWith(['l2', 'l1']);
    expect(mockSyncService.sync).toHaveBeenCalled();
  });
});
