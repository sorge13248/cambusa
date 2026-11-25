import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlannerSlotModalComponent } from './planner-slot-modal.component.js';
import { ApiService } from '../../../core/api.service.js';
import { UndoService } from '../../../core/undo.service.js';

describe('PlannerSlotModalComponent', () => {
  let component: PlannerSlotModalComponent;
  let fixture: ComponentFixture<PlannerSlotModalComponent>;

  const mockDialogRef = { close: vi.fn() };
  const mockDialog = { open: vi.fn().mockReturnValue({ closed: { subscribe: vi.fn(), pipe: vi.fn() } }) };
  const mockUndo = { register: vi.fn() };
  const mockApi = {
    getStock: vi.fn().mockResolvedValue([
      { id: 's1', productId: 'p1', productName: 'Pasta', amount: 2, bestBeforeDate: '2026-12-01', isOpen: false },
    ]),
    openStock: vi.fn().mockResolvedValue({
      openedStockItem: { id: 's1-open', isOpen: true },
      originalStockItem: { id: 's1', amount: 1 },
      split: true,
      originalDate: '2026-12-01',
      originalLocationId: null,
    }),
    consumeStock: vi.fn().mockResolvedValue({ consumed: true, remaining: 1 }),
    deleteMealPlanEntry: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PlannerSlotModalComponent],
      providers: [
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApi },
        { provide: UndoService, useValue: mockUndo },
        {
          provide: DIALOG_DATA,
          useValue: {
            date: '2026-11-25',
            dateLabel: 'Wednesday, Nov 25',
            mealSlot: 'lunch',
            mealSlotLabel: 'Lunch',
            entries: [
              { id: 'mp1', householdId: 'h1', date: '2026-11-25', mealSlot: 'lunch', productId: 'p1', userId: 'u1', sortOrder: 0 },
            ],
            stock: [
              { id: 's1', productId: 'p1', productName: 'Pasta', amount: 3, bestBeforeDate: '2026-11-28', isOpen: false },
            ],
            products: [{ id: 'p1', name: 'Pasta', quStockId: 'qu1' }],
            locations: [],
            productGroups: [],
            units: [{ id: 'qu1', name: 'packs' }],
            savedFilters: [],
            members: [{ id: 'm1', userId: 'u1', displayName: 'Federico', pictureUrl: 'https://example.com/a.jpg', role: 'owner' }],
            expiringSoonDays: 5,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlannerSlotModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should display food with total stock, earliest expiry, user avatar, and action buttons', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Pasta');
    expect(el.textContent).toContain('3 packs');
    expect(el.querySelector('.planner-user-avatar img')?.getAttribute('src')).toBe('https://example.com/a.jpg');
    expect(el.querySelectorAll('.btn-header-add').length).toBe(1);
    expect(el.textContent).toContain('Open 1');
    expect(el.textContent).toContain('Consume 1');
  });

  it('should call openStock and register undo on Open 1 click', async () => {
    await component.openOne(component.foodItems()[0]);
    expect(mockApi.openStock).toHaveBeenCalledWith('s1', 1);
    expect(mockUndo.register).toHaveBeenCalledTimes(1);
  });

  it('should call consumeStock and register undo on Consume 1 click', async () => {
    await component.consumeOne(component.foodItems()[0]);
    expect(mockApi.consumeStock).toHaveBeenCalledWith('s1', 1);
    expect(mockUndo.register).toHaveBeenCalledTimes(1);
  });
});
