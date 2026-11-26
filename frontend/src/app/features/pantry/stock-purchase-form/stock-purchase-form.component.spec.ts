import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimpleChange } from '@angular/core';
import { StockPurchaseFormComponent } from './stock-purchase-form.component.js';
import { ApiService } from '../../../core/api.service.js';
import { UndoService } from '../../../core/undo.service.js';
import { Product } from '../../../core/models.js';

describe('StockPurchaseFormComponent', () => {
  let component: StockPurchaseFormComponent;
  let fixture: ComponentFixture<StockPurchaseFormComponent>;

  const mockApiService = {
    addStock: vi.fn().mockResolvedValue({ id: 's-100', productId: 'p1', amount: 2 }),
    consumeStock: vi.fn().mockResolvedValue({ consumed: true }),
  };

  const mockUndoService = {
    register: vi.fn(),
  };

  const mockProduct: Product = {
    id: 'p1',
    householdId: 'h1',
    name: 'Spaghetti n.5',
    active: true,
    defaultLocationId: 'loc-1',
    defaultStoreId: 'store-1',
    defaultBestBeforeDays: 30,
    quStockId: 'u1',
    quFactor: 1,
  } as any;

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [StockPurchaseFormComponent],
      providers: [
        { provide: ApiService, useValue: mockApiService },
        { provide: UndoService, useValue: mockUndoService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StockPurchaseFormComponent);
    component = fixture.componentInstance;
    component.product = mockProduct;
    component.locations = [{ id: 'loc-1', name: 'Pantry' } as any];
    component.stores = [{ id: 'store-1', name: 'Supermarket' } as any];
    component.units = [{ id: 'u1', name: 'packs' } as any];
    fixture.detectChanges();
  });

  it('should initialize defaults based on product', () => {
    expect(component).toBeTruthy();
    expect(component.purchaseLocationId).toBe('loc-1');
    expect(component.purchaseStoreId).toBe('store-1');
    expect(component.purchaseBestBeforeDate).toBeTruthy();
  });

  it('should update defaults when product input changes', () => {
    const newProduct: Product = {
      id: 'p2',
      householdId: 'h1',
      name: 'Olive Oil',
      active: true,
      defaultLocationId: 'loc-2',
      defaultStoreId: 'store-2',
      defaultBestBeforeDays: 0,
    } as any;

    component.product = newProduct;
    component.ngOnChanges({
      product: new SimpleChange(mockProduct, newProduct, false),
    });

    expect(component.purchaseLocationId).toBe('loc-2');
    expect(component.purchaseStoreId).toBe('store-2');
    expect(component.purchaseBestBeforeDate).toBeNull();
  });

  it('should calculate unit price when priceMode is total', async () => {
    component.purchaseAmount = 2;
    component.purchasePrice = 10;
    component.purchasePriceMode = 'total';

    let submittedItem: any = null;
    component.submitted.subscribe((item) => (submittedItem = item));

    await component.submitPurchase();

    expect(mockApiService.addStock).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'p1',
        amount: 2,
        price: 5,
      }),
    );
    expect(mockUndoService.register).toHaveBeenCalled();
    expect(submittedItem).toEqual({ id: 's-100', productId: 'p1', amount: 2 });
  });

  it('should emit cancelled event on cancel', () => {
    let cancelledFired = false;
    component.cancelled.subscribe(() => (cancelledFired = true));

    component.onCancel();
    expect(cancelledFired).toBe(true);
  });

  it('should filter out freezer locations when product cannot be frozen', () => {
    component.locations = [
      { id: 'loc-1', name: 'Pantry', isFreezer: false } as any,
      { id: 'loc-2', name: 'Deep Freezer', isFreezer: true } as any,
    ];
    component.product = {
      ...mockProduct,
      cannotBeFrozen: true,
      defaultLocationId: 'loc-2',
    };
    component.ngOnChanges({
      product: new SimpleChange(null, component.product, true),
    });

    expect(component.availableLocations.map((l) => l.id)).toEqual(['loc-1']);
    expect(component.purchaseLocationId).toBe('loc-1');
  });

  it('should recalculate bestBeforeDate to TODAY + defaultBestBeforeDaysAfterFreezing when freezer location is selected and update UI', async () => {
    component.locations = [
      { id: 'loc-1', name: 'Pantry', isFreezer: false } as any,
      { id: 'loc-2', name: 'Deep Freezer', isFreezer: true } as any,
    ];
    component.product = {
      ...mockProduct,
      cannotBeFrozen: false,
      defaultLocationId: 'loc-1',
      defaultBestBeforeDays: 10,
      defaultBestBeforeDaysAfterFreezing: 90,
    };
    component.ngOnChanges({
      product: new SimpleChange(null, component.product, false),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const expectedDefault = new Date();
    expectedDefault.setDate(expectedDefault.getDate() + 10);
    const expectedDefaultStr = expectedDefault.toISOString().slice(0, 10);
    expect(component.purchaseBestBeforeDate).toBe(expectedDefaultStr);

    // Switch storage to freezer
    const select: HTMLSelectElement = fixture.nativeElement.querySelectorAll('select')[1];
    select.value = 'loc-2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    const expectedFreezer = new Date();
    expectedFreezer.setDate(expectedFreezer.getDate() + 90);
    const expectedFreezerStr = expectedFreezer.toISOString().slice(0, 10);

    expect(component.purchaseLocationId).toBe('loc-2');
    expect(component.purchaseBestBeforeDate).toBe(expectedFreezerStr);
    const dateInput: HTMLInputElement = fixture.nativeElement.querySelector('app-cdk-datepicker input[type="date"]');
    expect(dateInput.value).toBe(expectedFreezerStr);

    // Switch storage back to non-freezer
    select.value = 'loc-1';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.purchaseBestBeforeDate).toBe(expectedDefaultStr);
    expect(dateInput.value).toBe(expectedDefaultStr);
  });

  it('should use defaultBestBeforeDaysAfterFreezing on init when defaultLocationId is a freezer', () => {
    component.locations = [
      { id: 'loc-1', name: 'Pantry', isFreezer: false } as any,
      { id: 'loc-2', name: 'Deep Freezer', isFreezer: true } as any,
    ];
    component.product = {
      ...mockProduct,
      cannotBeFrozen: false,
      defaultLocationId: 'loc-2',
      defaultBestBeforeDays: 10,
      defaultBestBeforeDaysAfterFreezing: 120,
    };
    component.ngOnChanges({
      product: new SimpleChange(null, component.product, false),
    });
    fixture.detectChanges();

    const expectedFreezer = new Date();
    expectedFreezer.setDate(expectedFreezer.getDate() + 120);
    expect(component.purchaseLocationId).toBe('loc-2');
    expect(component.purchaseBestBeforeDate).toBe(expectedFreezer.toISOString().slice(0, 10));
  });
});
