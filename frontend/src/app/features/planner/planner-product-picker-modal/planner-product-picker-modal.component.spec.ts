import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlannerProductPickerModalComponent } from './planner-product-picker-modal.component.js';
import { ApiService } from '../../../core/api.service.js';

describe('PlannerProductPickerModalComponent', () => {
  let component: PlannerProductPickerModalComponent;
  let fixture: ComponentFixture<PlannerProductPickerModalComponent>;

  const mockDialogRef = { close: vi.fn() };
  const mockApi = {
    addMealPlanEntry: vi.fn().mockResolvedValue({
      id: 'mp-1',
      householdId: 'h1',
      date: '2026-11-25',
      mealSlot: 'lunch',
      productId: 'p1',
      userId: 'u1',
      sortOrder: 0,
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PlannerProductPickerModalComponent],
      providers: [
        provideRouter([]),
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: ApiService, useValue: mockApi },
        {
          provide: DIALOG_DATA,
          useValue: {
            date: '2026-11-25',
            mealSlot: 'lunch',
            mealSlotLabel: 'Lunch',
            dateLabel: 'Wednesday, Nov 25',
            stock: [{ id: 's1', productId: 'p1', productName: 'Pasta', amount: 2, bestBeforeDate: '2027-01-01' }],
            products: [{ id: 'p1', name: 'Pasta' }],
            locations: [],
            productGroups: [],
            units: [],
            savedFilters: [],
            expiringSoonDays: 5,
            initialProductIds: [],
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlannerProductPickerModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should add product on card click and stay open with Added feedback', async () => {
    const card = fixture.nativeElement.querySelector('.stock-card') as HTMLElement;
    expect(card).toBeTruthy();
    card.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockApi.addMealPlanEntry).toHaveBeenCalledWith({
      date: '2026-11-25',
      mealSlot: 'lunch',
      productId: 'p1',
    });
    expect(component.addedCount()).toBe(1);
    expect(component.selectedProductIds()).toContain('p1');
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });
});
