import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlannerComponent } from './planner.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { SyncService } from '../../core/sync.service.js';
import { UndoService } from '../../core/undo.service.js';

describe('PlannerComponent', () => {
  let component: PlannerComponent;
  let fixture: ComponentFixture<PlannerComponent>;

  const mockApi = {
    getMealPlanEntries: vi.fn().mockResolvedValue([]),
    getStock: vi.fn().mockResolvedValue([]),
    getProducts: vi.fn().mockResolvedValue([]),
    getLocations: vi.fn().mockResolvedValue([]),
    getGroups: vi.fn().mockResolvedValue([]),
    getUnits: vi.fn().mockResolvedValue([]),
    getSavedFilters: vi.fn().mockResolvedValue([]),
    getProfile: vi.fn().mockResolvedValue({ settings: { nextExpiringDays: 7 } }),
    getHouseholdMembers: vi.fn().mockResolvedValue([]),
    getProduct: vi.fn().mockResolvedValue(null),
    getStores: vi.fn().mockResolvedValue([]),
    computeNextDataLocally: vi.fn().mockReturnValue({
      summary: {
        expiredCount: 0,
        expiringSoonCount: 0,
        totalUniqueProductsInStock: 0,
        totalStockItems: 0,
        configuredDays: 7,
      },
      expired: [],
      expiringSoon: [],
      household: { id: 'h1', name: 'Home' },
      generatedAt: '2026-11-27T12:00:00.000Z',
    }),
    updateMealPlanEntry: vi.fn().mockResolvedValue(null),
    deleteMealPlanEntry: vi.fn().mockResolvedValue(undefined),
    addMealPlanEntry: vi.fn().mockResolvedValue({
      id: 'mp-restored',
      householdId: 'h1',
      date: '2026-11-25',
      mealSlot: 'lunch',
      productId: 'p1',
      userId: 'u1',
      sortOrder: 0,
      createdAt: '2026-11-25T10:00:00.000Z',
      updatedAt: '2026-11-25T10:00:00.000Z',
    }),
  };

  const mockAuth = {
    activeHouseholdId: signal('h1'),
  };

  const mockSync = {
    onSyncCompleted: signal(0),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PlannerComponent],
      providers: [
        { provide: ApiService, useValue: mockApi },
        { provide: AuthService, useValue: mockAuth },
        { provide: SyncService, useValue: mockSync },
        { provide: Dialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.loadData();
    fixture.detectChanges();
  });

  it('should render 7 days and 5 standard meal slots', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.day-header').length).toBe(7);
    expect(el.querySelectorAll('.slot-icon-cell').length).toBe(5);
    expect(el.querySelectorAll('.slot-label-cell').length).toBe(5);
    expect(el.querySelectorAll('.calendar-cell').length).toBe(35);
    expect(component.expiringSoonDays()).toBe(7);
  });

  it('should navigate weeks with previousWeek, nextWeek, and goToToday', () => {
    expect(component.weekOffset()).toBe(0);
    component.nextWeek();
    expect(component.weekOffset()).toBe(1);
    component.previousWeek();
    component.previousWeek();
    expect(component.weekOffset()).toBe(-1);
    component.goToToday();
    expect(component.weekOffset()).toBe(0);
  });

  it('should align today column to the left when calendar overflows horizontally', () => {
    const el: HTMLElement = fixture.nativeElement;
    const wrapper = el.querySelector<HTMLElement>('.calendar-wrapper')!;
    const todayHeader = wrapper.querySelector<HTMLElement>('.day-header.is-today')!;

    Object.defineProperty(wrapper, 'scrollWidth', { value: 1080, configurable: true });
    Object.defineProperty(wrapper, 'clientWidth', { value: 375, configurable: true });

    const scrollIntoViewMock = vi.fn();
    todayHeader.scrollIntoView = scrollIntoViewMock;

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    component.goToToday();

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'instant',
      inline: 'start',
      block: 'nearest',
    });

    rafSpy.mockRestore();
  });

  it('should not scroll when calendar fits within viewport width', () => {
    const el: HTMLElement = fixture.nativeElement;
    const wrapper = el.querySelector<HTMLElement>('.calendar-wrapper')!;
    const todayHeader = wrapper.querySelector<HTMLElement>('.day-header.is-today')!;

    Object.defineProperty(wrapper, 'scrollWidth', { value: 1080, configurable: true });
    Object.defineProperty(wrapper, 'clientWidth', { value: 1200, configurable: true });

    const scrollIntoViewMock = vi.fn();
    todayHeader.scrollIntoView = scrollIntoViewMock;

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    component.goToToday();

    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  it('should toggle isHorizontallyScrolled based on calendar scrollLeft', () => {
    const el: HTMLElement = fixture.nativeElement;
    const wrapper = el.querySelector<HTMLElement>('.calendar-wrapper')!;

    expect(component.isHorizontallyScrolled()).toBe(false);
    expect(wrapper.classList.contains('is-scrolled')).toBe(false);

    Object.defineProperty(wrapper, 'scrollLeft', { value: 120, configurable: true });
    wrapper.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.isHorizontallyScrolled()).toBe(true);
    expect(wrapper.classList.contains('is-scrolled')).toBe(true);

    Object.defineProperty(wrapper, 'scrollLeft', { value: 0, configurable: true });
    wrapper.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.isHorizontallyScrolled()).toBe(false);
    expect(wrapper.classList.contains('is-scrolled')).toBe(false);
  });

  it('should highlight matching column and row headers on cell hover', () => {
    const el: HTMLElement = fixture.nativeElement;
    const cells = el.querySelectorAll<HTMLElement>('.calendar-cell');
    const dayHeaders = el.querySelectorAll<HTMLElement>('.day-header');
    const slotIcons = el.querySelectorAll<HTMLElement>('.slot-icon-cell');
    const slotLabels = el.querySelectorAll<HTMLElement>('.slot-label-cell');

    // Hover 3rd day of 2nd meal slot (index 1 * 7 + 2 = 9)
    cells[9].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(dayHeaders[2].classList.contains('is-hovered')).toBe(true);
    expect(dayHeaders[0].classList.contains('is-hovered')).toBe(false);
    expect(slotIcons[1].classList.contains('is-hovered')).toBe(true);
    expect(slotLabels[1].classList.contains('is-hovered')).toBe(true);
    expect(slotIcons[0].classList.contains('is-hovered')).toBe(false);

    cells[9].dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();

    expect(dayHeaders[2].classList.contains('is-hovered')).toBe(false);
    expect(slotIcons[1].classList.contains('is-hovered')).toBe(false);
    expect(slotLabels[1].classList.contains('is-hovered')).toBe(false);
  });

  it('should move entry across days and meal slots on desktop drop', async () => {
    component.isDesktop.set(true);
    const entry = {
      id: 'mp-1',
      householdId: 'h1',
      date: '2026-11-25',
      mealSlot: 'lunch' as const,
      productId: 'p1',
      userId: 'u1',
      sortOrder: 0,
      createdAt: '2026-11-25T10:00:00.000Z',
      updatedAt: '2026-11-25T10:00:00.000Z',
    };
    component.entries.set([entry]);

    const itemVm = { entry, productName: 'Pasta', member: null, initials: '?' };
    await component.onEntryDrop({
      previousContainer: { data: { date: '2026-11-25', mealSlot: 'lunch' } } as any,
      container: { data: { date: '2026-11-26', mealSlot: 'dinner' } } as any,
      previousIndex: 0,
      currentIndex: 0,
      item: { data: itemVm } as any,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    });

    expect(component.entries()[0].date).toBe('2026-11-26');
    expect(component.entries()[0].mealSlot).toBe('dinner');
    expect(mockApi.updateMealPlanEntry).toHaveBeenCalledWith('mp-1', {
      date: '2026-11-26',
      mealSlot: 'dinner',
      sortOrder: 0,
    });
  });

  it('should ignore drop when not on desktop', async () => {
    component.isDesktop.set(false);
    const entry = {
      id: 'mp-2',
      householdId: 'h1',
      date: '2026-11-25',
      mealSlot: 'lunch' as const,
      productId: 'p1',
      userId: 'u1',
      sortOrder: 0,
      createdAt: '2026-11-25T10:00:00.000Z',
      updatedAt: '2026-11-25T10:00:00.000Z',
    };
    component.entries.set([entry]);

    const itemVm = { entry, productName: 'Pasta', member: null, initials: '?' };
    await component.onEntryDrop({
      previousContainer: { data: { date: '2026-11-25', mealSlot: 'lunch' } } as any,
      container: { data: { date: '2026-11-26', mealSlot: 'dinner' } } as any,
      previousIndex: 0,
      currentIndex: 0,
      item: { data: itemVm } as any,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    });

    expect(component.entries()[0].date).toBe('2026-11-25');
    expect(mockApi.updateMealPlanEntry).not.toHaveBeenCalled();
  });

  it('should delete entry from context menu and register undo action', async () => {
    const undoService = TestBed.inject(UndoService);
    const entry = {
      id: 'mp-3',
      householdId: 'h1',
      date: '2026-11-25',
      mealSlot: 'lunch' as const,
      productId: 'p1',
      userId: 'u1',
      sortOrder: 0,
      createdAt: '2026-11-25T10:00:00.000Z',
      updatedAt: '2026-11-25T10:00:00.000Z',
    };
    component.entries.set([entry]);

    await component.deleteEntryFromContextMenu({ entry, productName: 'Pasta', member: null, initials: '?' });

    expect(mockApi.deleteMealPlanEntry).toHaveBeenCalledWith('mp-3');
    expect(component.entries().length).toBe(0);
    expect(undoService.activeAction()?.description).toContain('Pasta');

    await undoService.executeUndo();
    expect(mockApi.addMealPlanEntry).toHaveBeenCalledWith({
      date: '2026-11-25',
      mealSlot: 'lunch',
      productId: 'p1',
      sortOrder: 0,
    });
    expect(component.entries().length).toBe(1);
  });

  it('should toggle the expiration alerts sidebar and push page content without backdrop', () => {
    expect(component.isAlertsSidebarOpen()).toBe(false);
    expect(document.body.classList.contains('has-push-sidebar-right')).toBe(false);

    const toggleBtn = fixture.nativeElement.querySelector('.alerts-toggle-btn') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    toggleBtn.click();
    fixture.detectChanges();

    expect(component.isAlertsSidebarOpen()).toBe(true);
    expect(document.body.classList.contains('has-push-sidebar-right')).toBe(true);
    expect(fixture.nativeElement.querySelector('.sidebar-backdrop')).toBeNull();
    const sidebar = fixture.nativeElement.querySelector('.sidebar-panel');
    expect(sidebar).toBeTruthy();
    expect(sidebar.querySelector('app-expiration-alerts')).toBeTruthy();
    expect(sidebar.querySelector('.alerts-grid.layout-stacked')).toBeTruthy();

    component.closeAlertsSidebar();
    fixture.detectChanges();
    expect(component.isAlertsSidebarOpen()).toBe(false);
    expect(document.body.classList.contains('has-push-sidebar-right')).toBe(false);
  });

  it('should clean up push sidebar body class on destroy', () => {
    component.toggleAlertsSidebar();
    fixture.detectChanges();
    expect(document.body.classList.contains('has-push-sidebar-right')).toBe(true);

    fixture.destroy();
    expect(document.body.classList.contains('has-push-sidebar-right')).toBe(false);
  });

  it('should add meal plan entry and register undo when an alert item is dropped onto a calendar cell', async () => {
    component.isDesktop.set(true);
    const undoService = TestBed.inject(UndoService);
    const createdEntry = {
      id: 'mp-from-alert',
      householdId: 'h1',
      date: '2026-11-26',
      mealSlot: 'dinner' as const,
      productId: 'prod-exp-1',
      userId: 'u1',
      sortOrder: 0,
      createdAt: '2026-11-26T10:00:00.000Z',
      updatedAt: '2026-11-26T10:00:00.000Z',
    };
    mockApi.addMealPlanEntry.mockResolvedValueOnce(createdEntry);

    await component.onEntryDrop({
      previousIndex: 0,
      currentIndex: 0,
      previousContainer: { data: { date: '', mealSlot: 'breakfast' } } as any,
      container: { data: { date: '2026-11-26', mealSlot: 'dinner' } } as any,
      item: {
        data: {
          kind: 'alert',
          item: {
            id: 'stock-1',
            productId: 'prod-exp-1',
            productName: 'Greek Yogurt',
            amount: 1,
            quantityUnit: 'cup',
            location: 'Fridge',
            bestBeforeDate: '2026-11-25',
            isOpened: false,
            daysOverdue: 2,
          },
        },
      } as any,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    });

    expect(mockApi.addMealPlanEntry).toHaveBeenCalledWith({
      date: '2026-11-26',
      mealSlot: 'dinner',
      productId: 'prod-exp-1',
      sortOrder: 0,
    });
    expect(component.entries().some((e) => e.id === 'mp-from-alert')).toBe(true);
    expect(undoService.activeAction()?.description).toContain('Greek Yogurt');

    await undoService.executeUndo();
    expect(mockApi.deleteMealPlanEntry).toHaveBeenCalledWith('mp-from-alert');
    expect(component.entries().some((e) => e.id === 'mp-from-alert')).toBe(false);
  });
});
