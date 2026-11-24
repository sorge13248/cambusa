import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, BehaviorSubject } from 'rxjs';
import { HomeComponent } from './home.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { UndoService } from '../../core/undo.service.js';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { NextResponseDto } from '../../core/models.js';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let mockQueryParamMap: BehaviorSubject<any>;

  const mockNextData: NextResponseDto = {
    summary: {
      expiredCount: 1,
      expiringSoonCount: 2,
      totalUniqueProductsInStock: 15,
      totalStockItems: 38.5,
      configuredDays: 5,
    },
    expired: [
      {
        id: 'item-exp-1',
        productId: 'prod-1',
        productName: 'Organic Milk',
        amount: 1,
        quantityUnit: 'bottle',
        location: 'Fridge',
        bestBeforeDate: '2026-11-20',
        isOpened: true,
        daysOverdue: 3,
      },
    ],
    expiringSoon: [
      {
        id: 'item-soon-1',
        productId: 'prod-2',
        productName: 'Cheddar Cheese',
        amount: 2,
        quantityUnit: 'pack',
        location: 'Fridge',
        bestBeforeDate: '2026-11-25',
        isOpened: false,
        daysRemaining: 2,
      },
    ],
    household: {
      id: 'hh-1',
      name: 'Main Villa',
    },
    generatedAt: '2026-11-23T12:00:00Z',
  };

  const mockApiService = {
    getNext: vi.fn().mockResolvedValue(mockNextData),
    getProduct: vi.fn().mockResolvedValue({ id: 'prod-1', name: 'Organic Milk' }),
    getStock: vi.fn().mockResolvedValue([]),
    getLocations: vi.fn().mockResolvedValue([]),
    getStores: vi.fn().mockResolvedValue([]),
    getUnits: vi.fn().mockResolvedValue([]),
    getQuantityUnits: vi.fn().mockResolvedValue([]),
    getProducts: vi.fn().mockResolvedValue([]),
    getGroups: vi.fn().mockResolvedValue([]),
    getProductGroups: vi.fn().mockResolvedValue([]),
  };

  const mockAuthService = {
    currentUser: vi.fn().mockReturnValue({ displayName: 'Alex Doe' }),
    activeHousehold: vi.fn().mockReturnValue({ name: 'Main Villa' }),
    activeHouseholdId: vi.fn().mockReturnValue('hh-1'),
  };

  const mockDialog = {
    open: vi.fn().mockReturnValue({
      closed: of({ refreshed: true }),
    }),
  };

  let mockRouter: { navigate: any };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQueryParamMap = new BehaviorSubject(convertToParamMap({}));
    const mockActivatedRoute = {
      queryParamMap: mockQueryParamMap.asObservable(),
      snapshot: {
        queryParamMap: convertToParamMap({}),
      },
    };
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: ApiService, useValue: mockApiService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: Dialog, useValue: mockDialog },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
  });

  it('creates and loads dashboard data on init', async () => {
    expect(component).toBeTruthy();
    await component.ngOnInit();
    expect(mockApiService.getNext).toHaveBeenCalled();
    expect(component.nextData()).toEqual(mockNextData);
    expect(component.nextData()?.summary.totalUniqueProductsInStock).toBe(15);
    expect(component.nextData()?.summary.totalStockItems).toBe(38.5);
    expect(component.nextData()?.summary.expiredCount).toBe(1);
    expect(component.nextData()?.summary.expiringSoonCount).toBe(2);
  });

  it('generates appropriate greeting', () => {
    const greeting = component.getGreeting();
    expect(['Good morning', 'Good afternoon', 'Good evening']).toContain(greeting);
  });

  it('reloads dashboard data when undo is executed', async () => {
    await component.ngOnInit();
    const loadSpy = vi.spyOn(component, 'loadDashboardData');
    const undoService = TestBed.inject(UndoService);
    undoService.onUndoExecuted.update((c) => c + 1);
    TestBed.flushEffects();
    expect(loadSpy).toHaveBeenCalled();
  });

  it('handles API error gracefully', async () => {
    mockApiService.getNext.mockRejectedValueOnce(new Error('Network failure'));
    await component.loadDashboardData();
    expect(component.errorMessage()).toContain('Could not fetch dashboard metrics');
    expect(component.isLoading()).toBe(false);
  });

  it('opens pantry action modal when product item is clicked', async () => {
    await component.ngOnInit();
    const item = mockNextData.expired[0];
    await component.openProductActionModal(item);
    expect(mockApiService.getProduct).toHaveBeenCalledWith('prod-1');
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('opens pantry action modal automatically when openProduct query param is provided', async () => {
    mockQueryParamMap.next(convertToParamMap({ openProduct: 'prod-1' }));
    await component.ngOnInit();
    expect(mockApiService.getProduct).toHaveBeenCalledWith('prod-1');
    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ openProduct: null }),
        replaceUrl: true,
      }),
    );
  });

  it('renders avatar picture when user has pictureUrl', () => {
    mockAuthService.currentUser.mockReturnValue({
      displayName: 'Alex Doe',
      pictureUrl: 'https://avatar.test/alex.webp',
    });
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('.welcome-avatar img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://avatar.test/alex.webp');
  });
});
