import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShoppingListModalComponent, ShoppingListModalData } from './shopping-list-modal.component.js';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/api.service.js';

describe('ShoppingListModalComponent', () => {
  let component: ShoppingListModalComponent;
  let fixture: ComponentFixture<ShoppingListModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
  };

  const mockApiService = {
    createShoppingList: vi.fn().mockResolvedValue({ id: 'l1', name: 'Groceries' }),
    updateShoppingList: vi.fn().mockResolvedValue({ id: 'l1', name: 'Groceries' }),
  };

  const mockData: ShoppingListModalData = {
    shoppingList: null,
    stores: [{ id: 's1', name: 'Coop' } as any],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingListModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShoppingListModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should save new shopping list', async () => {
    component.name = 'Weekly Market';
    await component.save();
    expect(mockApiService.createShoppingList).toHaveBeenCalledWith({
      name: 'Weekly Market',
      storeId: null,
      isDefault: false,
    });
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });
});
