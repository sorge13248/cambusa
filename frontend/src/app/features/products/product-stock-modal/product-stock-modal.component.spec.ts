import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductStockModalComponent, ProductStockModalData } from './product-stock-modal.component.js';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ApiService } from '../../../core/api.service.js';
import { StockItemEditorModalComponent } from '../../pantry/stock-item-editor-modal/stock-item-editor-modal.component.js';

describe('ProductStockModalComponent', () => {
  let component: ProductStockModalComponent;
  let fixture: ComponentFixture<ProductStockModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  const mockStockItems = [
    {
      id: 's1',
      productId: 'p1',
      productName: 'Organic Milk',
      amount: 2,
      locationName: 'Fridge',
      bestBeforeDate: '2026-12-01',
      isOpen: false,
      urgency: 'good',
      daysUntilExpiration: 8,
    },
    {
      id: 's2',
      productId: 'p1',
      productName: 'Organic Milk',
      amount: 1,
      locationName: 'Pantry',
      bestBeforeDate: '2026-11-20',
      isOpen: true,
      openedDate: '2026-11-18',
      urgency: 'expired',
      daysUntilExpiration: -3,
    },
    {
      id: 's3',
      productId: 'child1',
      productName: 'Organic Milk 500ml',
      amount: 3,
      locationName: 'Fridge',
      bestBeforeDate: '2026-11-25',
      isOpen: false,
      urgency: 'due_soon',
      daysUntilExpiration: 2,
    },
  ];

  const mockApiService = {
    getStock: vi.fn().mockResolvedValue(mockStockItems),
  };

  const mockData: ProductStockModalData = {
    product: {
      id: 'p1',
      name: 'Organic Milk',
      minStockAmount: 2,
      quStockId: 'u1',
      cannotBeFrozen: false,
    } as any,
    units: [{ id: 'u1', name: 'Bottle' } as any],
    locations: [{ id: 'l1', name: 'Fridge' } as any],
    allProducts: [
      { id: 'p1', name: 'Organic Milk' } as any,
      { id: 'child1', name: 'Organic Milk 500ml', parentProductId: 'p1' } as any,
    ],
  };

  beforeEach(async () => {
    mockDialogRef.close.mockClear();
    mockApiService.getStock.mockClear();

    await TestBed.configureTestingModule({
      imports: [ProductStockModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductStockModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load stock items on init', async () => {
    expect(component).toBeTruthy();
    expect(mockApiService.getStock).toHaveBeenCalled();
    await fixture.whenStable();

    expect(component.directStockItems().length).toBe(2);
    expect(component.totalDirectAmount()).toBe(3);
    expect(component.childStockItems().length).toBe(1);
    expect(component.totalFamilyAmount()).toBe(6);
    expect(component.stockUnitName()).toBe('Bottle');
  });

  it('should correctly count expired and due soon items', async () => {
    await fixture.whenStable();
    expect(component.expiredCount()).toBe(1);
    expect(component.dueSoonCount()).toBe(0); // child is due soon, direct has expired
  });

  it('should close dialog when close() is called', () => {
    component.close();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('should return appropriate labels for urgency and days', () => {
    expect(component.getUrgencyLabel('expired')).toBe('Expired');
    expect(component.getUrgencyLabel('due_soon')).toBe('Due Soon');
    expect(component.getUrgencyLabel('none')).toBe('No Expiration');

    expect(component.getDaysLabel(-2)).toBe('Expired 2 days ago');
    expect(component.getDaysLabel(0)).toBe('Expires today');
    expect(component.getDaysLabel(1)).toBe('Expires tomorrow');
    expect(component.getDaysLabel(5)).toBe('5 days remaining');
  });

  it('should open stock item editor modal when openEditStockItem is called', async () => {
    await fixture.whenStable();
    const item = component.directStockItems()[0];
    mockDialog.open.mockReturnValue({
      closed: of({ updated: true }),
    });

    component.openEditStockItem(item);

    expect(mockDialog.open).toHaveBeenCalledWith(
      StockItemEditorModalComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          stockItem: item,
        }),
      }),
    );
  });
});
