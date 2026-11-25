import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { PantryAddItemModalComponent, PantryAddItemModalData } from './pantry-add-item-modal.component.js';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component.js';
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
    updateProduct: vi.fn().mockImplementation(async (id: string, data: Partial<Product>) => ({
      id,
      name: 'Active Pasta',
      active: true,
      householdId: 'h1',
      ...data,
    })),
    getProducts: vi.fn().mockResolvedValue([]),
    getLocations: vi.fn().mockResolvedValue([]),
    getStores: vi.fn().mockResolvedValue([]),
    getUnits: vi.fn().mockResolvedValue([]),
    getProductGroups: vi.fn().mockResolvedValue([]),
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

  it('should update selected product when a product ID is selected and close scanner', async () => {
    expect(component.selectedProduct()).toBeNull();
    component.isScannerOpen.set(true);

    await component.onProductSelected('p1');
    expect(component.selectedProduct()).toBeTruthy();
    expect(component.selectedProduct()?.name).toBe('Active Pasta');
    expect(component.isScannerOpen()).toBe(false);
  });

  it('should reopen scanner after purchase success in quick purchase mode', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PantryAddItemModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { quickPurchaseMode: true, products: mockProducts } },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
        { provide: UndoService, useValue: mockUndoService },
      ],
    }).compileComponents();

    const quickFixture = TestBed.createComponent(PantryAddItemModalComponent);
    const quickComponent = quickFixture.componentInstance;
    quickFixture.detectChanges();

    quickComponent.isScannerOpen.set(false);
    quickComponent.onPurchaseSuccess({ id: 's-new', amount: 1 } as any);

    expect(quickComponent.isScannerOpen()).toBe(true);
    expect(quickComponent.selectedProductId()).toBeNull();
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

  it('should open product editor, close scanner, pass pending barcode, and auto-select newly created product', async () => {
    component.isScannerOpen.set(true);
    component.pendingScannedBarcode.set('800999888');

    await component.openCreateProductModal('Fresh Basil');
    expect(component.isScannerOpen()).toBe(false);
    expect(mockDialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          initialName: 'Fresh Basil',
          initialBarcode: '800999888',
        }),
      }),
    );
    expect(component.pendingScannedBarcode()).toBeNull();
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

  it('should load products, locations, stores, units, and productGroups when omitted from dialog data', async () => {
    const loadedProducts: Product[] = [{ id: 'p-api', name: 'API Milk', active: true, householdId: 'h1' } as any];
    const loadedLocations = [{ id: 'loc-api', name: 'Fridge' } as any];
    const loadedStores = [{ id: 'store-api', name: 'Market' } as any];
    const loadedUnits = [{ id: 'u-api', name: 'L' } as any];
    const loadedGroups = [{ id: 'g-api', name: 'Dairy' } as any];

    mockApiService.getProducts.mockResolvedValueOnce(loadedProducts);
    mockApiService.getLocations.mockResolvedValueOnce(loadedLocations);
    mockApiService.getStores.mockResolvedValueOnce(loadedStores);
    mockApiService.getUnits.mockResolvedValueOnce(loadedUnits);
    mockApiService.getProductGroups.mockResolvedValueOnce(loadedGroups);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PantryAddItemModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { quickPurchaseMode: true, startWithScanner: true } },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
        { provide: UndoService, useValue: mockUndoService },
      ],
    }).compileComponents();

    const quickFixture = TestBed.createComponent(PantryAddItemModalComponent);
    const quickComponent = quickFixture.componentInstance;
    quickFixture.detectChanges();
    await quickFixture.whenStable();

    expect(mockApiService.getProducts).toHaveBeenCalled();
    expect(mockApiService.getLocations).toHaveBeenCalled();
    expect(mockApiService.getStores).toHaveBeenCalled();
    expect(mockApiService.getUnits).toHaveBeenCalled();
    expect(mockApiService.getProductGroups).toHaveBeenCalled();
    expect(quickComponent.activeProducts()).toEqual(loadedProducts);
    expect(quickComponent.locations()).toEqual(loadedLocations);
    expect(quickComponent.stores()).toEqual(loadedStores);
    expect(quickComponent.units()).toEqual(loadedUnits);
    expect(quickComponent.productGroups()).toEqual(loadedGroups);
  });

  it('should prompt to save unknown scanned barcode when selecting a product in quick purchase mode and save on confirm', async () => {
    const quickProducts: Product[] = [
      { id: 'p1', name: 'Active Pasta', barcodes: ['111111'], active: true, householdId: 'h1' } as any,
    ];
    mockApiService.getProducts.mockResolvedValueOnce(quickProducts);
    mockDialog.open.mockReturnValueOnce({ closed: of(true) });

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PantryAddItemModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { quickPurchaseMode: true, startWithScanner: true } },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
        { provide: UndoService, useValue: mockUndoService },
      ],
    }).compileComponents();

    const quickFixture = TestBed.createComponent(PantryAddItemModalComponent);
    const quickComponent = quickFixture.componentInstance;
    quickFixture.detectChanges();
    await quickFixture.whenStable();

    quickComponent.onBarcodeScanned('999888777');
    expect(quickComponent.pendingScannedBarcode()).toBe('999888777');
    expect(quickComponent.isScannerOpen()).toBe(false);

    await quickComponent.onProductSelected('p1');

    expect(mockDialog.open).toHaveBeenCalledWith(
      ConfirmModalComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Save Barcode to Product?',
          confirmLabel: 'Save Barcode',
        }),
      }),
    );
    expect(mockApiService.updateProduct).toHaveBeenCalledWith('p1', {
      barcodes: ['111111', '999888777'],
    });
    expect(quickComponent.pendingScannedBarcode()).toBeNull();
    expect(quickComponent.activeProducts()[0].barcodes).toEqual(['111111', '999888777']);
  });

  it('should not save unknown scanned barcode when user declines confirmation in quick purchase mode', async () => {
    const quickProducts: Product[] = [
      { id: 'p1', name: 'Active Pasta', barcodes: ['111111'], active: true, householdId: 'h1' } as any,
    ];
    mockApiService.getProducts.mockResolvedValueOnce(quickProducts);
    mockDialog.open.mockReturnValueOnce({ closed: of(false) });

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PantryAddItemModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { quickPurchaseMode: true, startWithScanner: true } },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
        { provide: UndoService, useValue: mockUndoService },
      ],
    }).compileComponents();

    const quickFixture = TestBed.createComponent(PantryAddItemModalComponent);
    const quickComponent = quickFixture.componentInstance;
    quickFixture.detectChanges();
    await quickFixture.whenStable();

    quickComponent.onBarcodeScanned('999888777');
    await quickComponent.onProductSelected('p1');

    expect(mockDialog.open).toHaveBeenCalledWith(ConfirmModalComponent, expect.any(Object));
    expect(mockApiService.updateProduct).not.toHaveBeenCalled();
    expect(quickComponent.pendingScannedBarcode()).toBeNull();
  });

  it('should not prompt to save unknown scanned barcode outside quick purchase mode', async () => {
    component.onBarcodeScanned('999888777');
    expect(component.pendingScannedBarcode()).toBeNull();

    await component.onProductSelected('p1');
    expect(mockDialog.open).not.toHaveBeenCalled();
    expect(mockApiService.updateProduct).not.toHaveBeenCalled();
  });
});
