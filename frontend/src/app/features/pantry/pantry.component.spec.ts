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
    adjustDate: vi.fn().mockResolvedValue({ id: 's1' }),
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
});
