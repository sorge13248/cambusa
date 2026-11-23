import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PantryActionModalComponent, PantryActionModalData } from './pantry-action-modal.component.js';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/api.service.js';
import { UndoService } from '../../../core/undo.service.js';

import { of } from 'rxjs';
import { StockItemEditorModalComponent } from '../stock-item-editor-modal/stock-item-editor-modal.component.js';

describe('PantryActionModalComponent', () => {
  let component: PantryActionModalComponent;
  let fixture: ComponentFixture<PantryActionModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
    backdropClick: { subscribe: vi.fn() },
    keydownEvents: { subscribe: vi.fn() },
  };

  const mockDialog = {
    open: vi.fn(),
  };

  const mockApiService = {
    consumeStock: vi.fn().mockResolvedValue({ consumed: true, remaining: 0 }),
    addStock: vi.fn().mockResolvedValue({ id: 's2', amount: 2 }),
    transferStock: vi.fn().mockResolvedValue({ transferred: true }),
    adjustDate: vi.fn().mockResolvedValue({ id: 's1' }),
  };

  const mockUndoService = {
    register: vi.fn(),
  };

  const mockData: PantryActionModalData = {
    product: { id: 'p1', name: 'Pasta Garofalo', defaultBestBeforeDays: 0 } as any,
    stockItems: [
      { id: 's1', productId: 'p1', amount: 3, locationId: 'l1', bestBeforeDate: '2027-01-01' } as any,
      { id: 's2', productId: 'p1', amount: 4, locationId: 'l2', bestBeforeDate: '2027-05-01' } as any,
    ],
    locations: [{ id: 'l1', name: 'Pantry' } as any, { id: 'l2', name: 'Freezer', isFreezer: true } as any],
    stores: [],
    units: [{ id: 'u1', name: 'packs' } as any],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PantryActionModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
        { provide: UndoService, useValue: mockUndoService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PantryActionModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should calculate total stock correctly across multiple batches', () => {
    expect(component).toBeTruthy();
    expect(component.totalStockAmount()).toBe(7);
  });

  it('should submit consume and register undo action', async () => {
    component.consumeAmount = 1;
    await component.submitConsume();
    expect(mockApiService.consumeStock).toHaveBeenCalled();
    expect(mockUndoService.register).toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('should close dialog when purchase is submitted', () => {
    component.onPurchaseSubmitted({ id: 's-purchase' } as any);
    expect(mockDialogRef.close).toHaveBeenCalledWith({ refreshed: true, updatedProduct: undefined });
  });

  it('should open stock item editor modal when openEditStockItem is called', async () => {
    const item = component.productStockItems()[0];
    const updated = { ...item, amount: 5 };
    mockDialog.open.mockReturnValue({
      closed: of({ updated: true, stockItem: updated }),
    });

    component.openEditStockItem(item);
    await Promise.resolve();

    expect(mockDialog.open).toHaveBeenCalledWith(
      StockItemEditorModalComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          stockItem: item,
        }),
      }),
    );
    expect(component.productStockItems().find((s) => s.id === item.id)?.amount).toBe(5);
  });
});
