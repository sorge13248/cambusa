import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { PantryComponent } from './pantry.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { UndoService } from '../../core/undo.service.js';
import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { PantryAddItemModalComponent } from './pantry-add-item-modal/pantry-add-item-modal.component.js';
import { StockItemEditorModalComponent } from './stock-item-editor-modal/stock-item-editor-modal.component.js';

describe('PantryComponent', () => {
  let component: PantryComponent;
  let fixture: ComponentFixture<PantryComponent>;

  const mockStock = [
    { id: 's1', productId: 'p1', productName: 'Ragù', amount: 3, bestBeforeDate: '2027-04-30' },
    { id: 's2', productId: 'p1', productName: 'Ragù', amount: 4, bestBeforeDate: '2027-02-06' },
  ];

  const mockApiService = {
    getStock: vi.fn().mockResolvedValue(mockStock),
    getProducts: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Ragù', description: 'Homemade meat sauce' }]),
    getLocations: vi.fn().mockResolvedValue([]),
    getGroups: vi.fn().mockResolvedValue([]),
    getStores: vi.fn().mockResolvedValue([]),
    getUnits: vi.fn().mockResolvedValue([{ id: 'u1', name: 'units' }]),
    getSavedFilters: vi.fn().mockResolvedValue([]),
    saveFilter: vi.fn().mockResolvedValue({ id: 'f1', name: 'Test', filterConfig: '{}' }),
    consumeStock: vi.fn().mockResolvedValue({ consumed: true }),
    toggleOpen: vi.fn().mockResolvedValue({ id: 's2', isOpen: true }),
    openStock: vi.fn().mockResolvedValue({
      openedStockItem: { id: 's2-opened', isOpen: true },
      originalStockItem: { id: 's2', amount: 1 },
      split: true,
      originalDate: '2026-11-20',
      originalLocationId: null,
    }),
    revertOpen: vi.fn().mockResolvedValue({ reverted: true }),
    adjustDate: vi.fn().mockResolvedValue({ id: 's1' }),
    getProfile: vi.fn().mockResolvedValue({
      user: { id: 'u1', displayName: 'Test User' },
      settings: { nextExpiringDays: 7 },
      apiKeys: [],
    }),
  };

  const mockAuthService = {
    activeHouseholdId: signal('h1'),
  };

  const mockUndoService = {
    register: vi.fn(),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PantryComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: mockApiService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: UndoService, useValue: mockUndoService },
        { provide: Dialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PantryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load stock', () => {
    expect(component).toBeTruthy();
    expect(mockApiService.getStock).toHaveBeenCalled();
    expect(component.stock().length).toBe(2);
  });

  it('should calculate total product stock across multiple batches', () => {
    const total = component.getTotalProductStock('p1');
    expect(total).toBe(7);
  });

  it('should consume stock and register undo action', async () => {
    await component.consume(mockStock[0] as any, 1);
    expect(mockApiService.consumeStock).toHaveBeenCalledWith('s1', 1);
    expect(mockUndoService.register).toHaveBeenCalled();
  });

  it('should filter items by free-text search on description and consolidate by product', () => {
    component.searchQuery.set('homemade meat sauce');
    component.applyLocalFilters();
    expect(component.totalItems()).toBe(1);
    expect(component.paginatedStock().length).toBe(1);
    expect(component.paginatedStock()[0].totalAmount).toBe(7);

    component.searchQuery.set('nonexistent query');
    component.applyLocalFilters();
    expect(component.totalItems()).toBe(0);
    expect(component.paginatedStock().length).toBe(0);
  });

  it('should open PantryAddItemModalComponent on openAddStockModal', () => {
    mockDialog.open.mockReturnValue({ closed: of({ refreshed: true }) });
    component.openAddStockModal();
    expect(mockDialog.open).toHaveBeenCalledWith(
      PantryAddItemModalComponent,
      expect.objectContaining({
        disableClose: true,
        data: expect.objectContaining({
          products: expect.any(Array),
        }),
      }),
    );
  });

  it('should open StockItemEditorModalComponent on openEditStockItem', () => {
    mockDialog.open.mockReturnValue({ closed: of({ updated: true }) });
    const item = mockStock[0] as any;
    component.openEditStockItem(item);
    expect(mockDialog.open).toHaveBeenCalledWith(
      StockItemEditorModalComponent,
      expect.objectContaining({
        disableClose: true,
        data: expect.objectContaining({
          stockItem: item,
        }),
      }),
    );
  });

  it('should load user configured expiring soon days from profile settings (/next configuration)', () => {
    expect(mockApiService.getProfile).toHaveBeenCalled();
    expect(component.expiringSoonDays()).toBe(7);
  });

  it('should clear all filters immediately when clearAllFilters is called', () => {
    component.searchQuery.set('pasta');
    component.selectedGroupId = 'g1';
    component.selectedLocationId = 'l1';
    component.selectedStatus = 'due';
    component.sortBy = 'amount';
    component.currentPage.set(2);
    component.applyLocalFilters();

    expect(component.hasActiveFilters()).toBe(true);

    component.clearAllFilters();

    expect(component.searchQuery()).toBe('');
    expect(component.selectedGroupId).toBe('');
    expect(component.selectedLocationId).toBe('');
    expect(component.selectedStatus).toBe('all');
    expect(component.sortBy).toBe('bestBeforeDate');
    expect(component.currentPage()).toBe(1);
    expect(component.hasActiveFilters()).toBe(false);
  });

  it('should filter expiring soon items dynamically according to configured scan horizon', () => {
    const now = new Date();
    const in5Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5);
    const in12Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 12);
    const date5Str = `${in5Days.getFullYear()}-${String(in5Days.getMonth() + 1).padStart(2, '0')}-${String(in5Days.getDate()).padStart(2, '0')}`;
    const date12Str = `${in12Days.getFullYear()}-${String(in12Days.getMonth() + 1).padStart(2, '0')}-${String(in12Days.getDate()).padStart(2, '0')}`;

    component.products.set([
      { id: 'p1', name: 'Milk' } as any,
      { id: 'p2', name: 'Rice' } as any,
    ]);
    component.stock.set([
      { id: 's1', productId: 'p1', productName: 'Milk', amount: 1, bestBeforeDate: date5Str } as any,
      { id: 's2', productId: 'p2', productName: 'Rice', amount: 2, bestBeforeDate: date12Str } as any,
    ]);

    // When configured with 7 days (default from mock)
    component.expiringSoonDays.set(7);
    component.selectedStatus = 'due';
    component.applyLocalFilters();

    expect(component.filteredStock().length).toBe(1);
    expect(component.filteredStock()[0].productName).toBe('Milk');

    // When scan horizon is widened to 15 days
    component.expiringSoonDays.set(15);
    component.applyLocalFilters();

    expect(component.filteredStock().length).toBe(2);
  });

  it('should mark earliest expiring batch as opened and register undo when openOne is called', async () => {
    const batch1 = { id: 's1', productId: 'p1', productName: 'Milk', amount: 1, bestBeforeDate: '2026-12-01', isOpen: false } as any;
    const batch2 = { id: 's2', productId: 'p1', productName: 'Milk', amount: 1, bestBeforeDate: '2026-11-20', isOpen: false } as any;
    const item = {
      id: 'p1',
      productId: 'p1',
      productName: 'Milk',
      batches: [batch1, batch2],
      primaryStockItem: batch2,
      totalAmount: 2,
      isOpen: false,
    } as any;

    expect(component.hasUnopenedBatch(item)).toBe(true);

    await component.openOne(item);

    expect(mockApiService.openStock).toHaveBeenCalledWith('s2', 1);
    expect(mockUndoService.register).toHaveBeenCalled();
  });
});
