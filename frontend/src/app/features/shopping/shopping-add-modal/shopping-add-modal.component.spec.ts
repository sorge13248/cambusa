import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShoppingAddModalComponent, ShoppingAddModalData } from './shopping-add-modal.component.js';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/api.service.js';

describe('ShoppingAddModalComponent', () => {
  let component: ShoppingAddModalComponent;
  let fixture: ComponentFixture<ShoppingAddModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
    backdropClick: { subscribe: vi.fn() },
    keydownEvents: { subscribe: vi.fn() },
  };

  const mockDialog = {
    open: vi.fn(),
  };

  const mockApiService = {
    getStock: vi.fn().mockResolvedValue([]),
    addShoppingItem: vi.fn().mockResolvedValue({ id: 'item1' }),
    updateShoppingItem: vi.fn().mockResolvedValue({ id: 'item1' }),
  };

  const mockData: ShoppingAddModalData = {
    products: [
      { id: 'p1', name: 'Milk', barcodes: ['111'] } as any,
      { id: 'p2', name: 'Eggs', barcodes: ['222'] } as any,
    ],
    stores: [{ id: 's1', name: 'Supermarket' } as any],
    shoppingListId: 'list1',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingAddModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShoppingAddModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and show initial candidate search results', () => {
    expect(component).toBeTruthy();
    expect(component.searchResults().length).toBe(2);
  });

  it('should filter products reactively when searchQuery changes', () => {
    component.searchQuery.set('egg');
    expect(component.searchResults().length).toBe(1);
    expect(component.searchResults()[0].name).toBe('Eggs');
  });

  it('should select product and save', async () => {
    component.selectProduct(mockData.products[0]);
    expect(component.selectedProduct()?.name).toBe('Milk');
    expect(component.canSave()).toBe(true);

    await component.save();
    expect(mockApiService.addShoppingItem).toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });

  it('should toggle camera scanner and select product on scanned barcode', () => {
    expect(component.isScannerOpen()).toBe(false);
    component.toggleScanner();
    expect(component.isScannerOpen()).toBe(true);

    component.onBarcodeScanned('222');
    expect(component.selectedProduct()?.name).toBe('Eggs');
    expect(component.isScannerOpen()).toBe(false);
  });
});
