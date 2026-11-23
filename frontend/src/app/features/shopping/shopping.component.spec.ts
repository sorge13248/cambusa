import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShoppingComponent } from './shopping.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';

describe('ShoppingComponent', () => {
  let component: ShoppingComponent;
  let fixture: ComponentFixture<ShoppingComponent>;

  const mockApiService = {
    getShoppingLists: vi.fn().mockResolvedValue([
      { id: 'l1', name: 'Main List', isDefault: true },
    ]),
    getProducts: vi.fn().mockResolvedValue([]),
    getStores: vi.fn().mockResolvedValue([]),
    getMissingProducts: vi.fn().mockResolvedValue([]),
    getShoppingItems: vi.fn().mockResolvedValue([
      { id: 'i1', productName: 'Bananas', amount: 3, done: false },
    ]),
    toggleShoppingItemDone: vi.fn().mockResolvedValue(undefined),
    deleteShoppingItem: vi.fn().mockResolvedValue(undefined),
    addShoppingItem: vi.fn().mockResolvedValue({ id: 'i2' }),
  };

  const mockAuthService = {
    activeHouseholdId: signal('h1'),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingComponent],
      providers: [
        { provide: ApiService, useValue: mockApiService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: Dialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShoppingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load shopping list and items', () => {
    expect(component).toBeTruthy();
    expect(mockApiService.getShoppingLists).toHaveBeenCalled();
    expect(component.shoppingLists().length).toBe(1);
    expect(component.selectedListId()).toBe('l1');
    expect(component.items().length).toBe(1);
  });

  it('should toggle item done state non-destructively', async () => {
    expect(component.items()[0].done).toBe(false);
    await component.toggleDone('i1');
    expect(component.items()[0].done).toBe(true);
    expect(mockApiService.toggleShoppingItemDone).toHaveBeenCalledWith('i1');
  });

  it('should quick add item', async () => {
    component.newItemName = 'Apples';
    component.newItemAmount = 4;
    await component.quickAddItem();
    expect(mockApiService.addShoppingItem).toHaveBeenCalledWith(
      expect.objectContaining({
        customName: 'Apples',
        amount: 4,
      }),
    );
  });
});
