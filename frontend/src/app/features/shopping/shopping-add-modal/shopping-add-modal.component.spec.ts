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
    getShoppingLists: vi.fn().mockResolvedValue([{ id: 'list-default', name: 'Groceries', isDefault: true }]),
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

  it('should preselect initialProduct without marking dirty and resolve default list on save', async () => {
    const preselectedData: ShoppingAddModalData = {
      products: mockData.products,
      stores: mockData.stores,
      initialProduct: { id: 'p1', name: 'Milk', defaultStoreId: 's1' } as any,
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ShoppingAddModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: preselectedData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    const preFixture = TestBed.createComponent(ShoppingAddModalComponent);
    const preComponent = preFixture.componentInstance;
    preFixture.detectChanges();

    expect(preComponent.selectedProduct()?.id).toBe('p1');
    expect(preComponent.selectedStoreId).toBe('s1');
    expect(preComponent.isDirty()).toBe(false);
    expect(preComponent.canSave()).toBe(true);

    await preComponent.save();
    expect(mockApiService.addShoppingItem).toHaveBeenCalledWith(
      expect.objectContaining({
        shoppingListId: 'list-default',
        productId: 'p1',
        storeId: 's1',
      }),
    );
  });
});
