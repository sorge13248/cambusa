import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StockItemEditorModalComponent, StockItemEditorModalData } from './stock-item-editor-modal.component.js';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/api.service.js';
import { UndoService } from '../../../core/undo.service.js';

describe('StockItemEditorModalComponent', () => {
  let component: StockItemEditorModalComponent;
  let fixture: ComponentFixture<StockItemEditorModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
  };

  const mockApiService = {
    updateStockItem: vi.fn().mockResolvedValue({
      id: 's1',
      amount: 3,
      bestBeforeDate: '2027-01-01',
      locationId: 'loc2',
      price: 4.5,
      note: 'Updated notes',
    }),
  };

  const mockUndoService = {
    register: vi.fn(),
  };

  const mockData: StockItemEditorModalData = {
    stockItem: {
      id: 's1',
      productId: 'p1',
      productName: 'Organic Pasta',
      amount: 2,
      bestBeforeDate: '2026-12-15',
      locationId: 'loc1',
      locationName: 'Pantry Shelf',
      price: 3.2,
      note: 'Bought on sale',
      isOpen: false,
      productCannotBeFrozen: false,
    } as any,
    locations: [
      { id: 'loc1', name: 'Pantry Shelf', isFreezer: false } as any,
      { id: 'loc2', name: 'Deep Freezer', isFreezer: true } as any,
    ],
    product: {
      id: 'p1',
      name: 'Organic Pasta',
      cannotBeFrozen: true,
    } as any,
  };

  beforeEach(async () => {
    mockDialogRef.close.mockClear();
    mockApiService.updateStockItem.mockClear();
    mockUndoService.register.mockClear();

    await TestBed.configureTestingModule({
      imports: [StockItemEditorModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: ApiService, useValue: mockApiService },
        { provide: UndoService, useValue: mockUndoService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StockItemEditorModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and populate initial values from stockItem', () => {
    expect(component).toBeTruthy();
    expect(component.amount).toBe(2);
    expect(component.bestBeforeDate).toBe('2026-12-15');
    expect(component.locationId()).toBe('loc1');
    expect(component.price).toBe(3.2);
    expect(component.note).toBe('Bought on sale');
  });

  it('should adjust amount with stepper', () => {
    component.adjustAmount(1);
    expect(component.amount).toBe(3);
    component.adjustAmount(-1);
    expect(component.amount).toBe(2);
    component.adjustAmount(-10);
    expect(component.amount).toBe(1); // min 1
  });

  it('should detect freezer warning when product cannot be frozen', () => {
    component.locationId.set('loc2'); // Deep Freezer
    expect(component.freezerWarning()).toBe(true);
  });

  it('should save updated stock item, register undo, and close modal', async () => {
    component.locationId.set('loc1');
    component.amount = 3;
    component.bestBeforeDate = '2027-01-01';
    component.price = 4.5;
    component.note = 'Updated notes';

    await component.save();

    expect(mockApiService.updateStockItem).toHaveBeenCalledWith('s1', {
      amount: 3,
      bestBeforeDate: '2027-01-01',
      locationId: 'loc1',
      price: 4.5,
      note: 'Updated notes',
      isOpen: false,
      openedDate: null,
    });

    expect(mockUndoService.register).toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        updated: true,
        stockItem: expect.objectContaining({
          id: 's1',
          amount: 3,
        }),
      }),
    );
  });

  it('should close dialog when cancel() is called', () => {
    component.cancel();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });
});
