import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShoppingMissingModalComponent, ShoppingMissingModalData } from './shopping-missing-modal.component.js';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/api.service.js';

describe('ShoppingMissingModalComponent', () => {
  let component: ShoppingMissingModalComponent;
  let fixture: ComponentFixture<ShoppingMissingModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
  };

  const mockApiService = {
    addMissingProducts: vi.fn().mockResolvedValue([]),
  };

  const mockData: ShoppingMissingModalData = {
    shoppingListId: 'list1',
    missingProducts: [
      {
        productId: 'p1',
        productName: 'Olive Oil',
        currentStock: 0,
        minStockAmount: 2,
        amountMissing: 2,
      } as any,
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingMissingModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShoppingMissingModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and select all items by default', () => {
    expect(component).toBeTruthy();
    expect(component.selectedIds.size).toBe(1);
    expect(component.selectedIds.has('p1')).toBe(true);
  });

  it('should add selected missing products', async () => {
    await component.addSelected();
    expect(mockApiService.addMissingProducts).toHaveBeenCalledWith('list1', ['p1']);
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });
});
