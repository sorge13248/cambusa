import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlannerComponent } from './planner.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { SyncService } from '../../core/sync.service.js';

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
});
