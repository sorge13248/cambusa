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
});
