import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { PantryAddItemModalComponent, PantryAddItemModalData } from './pantry-add-item-modal.component.js';
import { ApiService } from '../../../core/api.service.js';
import { UndoService } from '../../../core/undo.service.js';
import { Product } from '../../../core/models.js';

describe('PantryAddItemModalComponent', () => {
  let component: PantryAddItemModalComponent;
  let fixture: ComponentFixture<PantryAddItemModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
    backdropClick: { subscribe: vi.fn() },
    keydownEvents: { subscribe: vi.fn() },
  };

  const mockDialog = {
    open: vi.fn().mockReturnValue({
      closed: of({ product: { id: 'p-created', name: 'Fresh Basil', active: true, householdId: 'h1' } }),
    }),
  };

  const mockApiService = {
    addStock: vi.fn().mockResolvedValue({ id: 's1' }),
  };

  const mockUndoService = {
    register: vi.fn(),
  };

  const mockProducts: Product[] = [
    { id: 'p1', name: 'Active Pasta', active: true, householdId: 'h1' } as any,
    { id: 'p2', name: 'Inactive Sauce', active: false, householdId: 'h1' } as any,
    { id: 'p3', name: 'Active Rice', active: true, householdId: 'h1' } as any,
  ];

  const mockData: PantryAddItemModalData = {
    products: mockProducts,
    locations: [{ id: 'loc1', name: 'Pantry' } as any],
    stores: [{ id: 'store1', name: 'Supermarket' } as any],
    units: [{ id: 'u1', name: 'kg' } as any],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [PantryAddItemModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
        { provide: UndoService, useValue: mockUndoService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PantryAddItemModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should filter out inactive products from options', () => {
    expect(component).toBeTruthy();
    expect(component.activeProducts().length).toBe(2);
    expect(component.activeProducts().map((p) => p.name)).toEqual(['Active Pasta', 'Active Rice']);

    const options = component.productOptions();
    expect(options.length).toBe(2);
    expect(options.some((o) => o.label === 'Inactive Sauce')).toBe(false);
  });

  it('should update selected product when a product ID is selected', () => {
    expect(component.selectedProduct()).toBeNull();

    component.onProductSelected('p1');
    expect(component.selectedProduct()).toBeTruthy();
    expect(component.selectedProduct()?.name).toBe('Active Pasta');
  });

  it('should clear selection when clearSelectedProduct is called', () => {
    component.onProductSelected('p1');
    expect(component.selectedProductId()).toBe('p1');

    const mockInput = { value: 'Active Pasta' } as HTMLInputElement;
    component.clearSelectedProduct(mockInput);

    expect(component.selectedProductId()).toBeNull();
    expect(component.selectedProduct()).toBeNull();
    expect(mockInput.value).toBe('');
  });

  it('should close dialog with refreshed flag when purchase succeeds', () => {
    const mockStockItem = { id: 's-new', amount: 2 } as any;
    component.onPurchaseSuccess(mockStockItem);

    expect(mockDialogRef.close).toHaveBeenCalledWith({ refreshed: true, stockItem: mockStockItem });
  });

  it('should close dialog when close() is invoked', () => {
    component.close();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('should open product editor and auto-select newly created product', async () => {
    await component.openCreateProductModal('Fresh Basil');
    expect(mockDialog.open).toHaveBeenCalled();
    expect(component.selectedProductId()).toBe('p-created');
    expect(component.selectedProduct()?.name).toBe('Fresh Basil');
  });

  it('should toggle camera scanner and select product on barcode scan', () => {
    // Add barcode to p1
    mockProducts[0].barcodes = ['800111222'];

    expect(component.isScannerOpen()).toBe(false);
    component.toggleScanner();
    expect(component.isScannerOpen()).toBe(true);

    component.onBarcodeScanned('800111222');
    expect(component.selectedProductId()).toBe('p1');
    expect(component.isScannerOpen()).toBe(false);
  });
});
