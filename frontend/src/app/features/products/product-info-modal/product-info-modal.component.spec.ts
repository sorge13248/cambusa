import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Router } from '@angular/router';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ProductInfoModalComponent, ProductInfoModalData } from './product-info-modal.component.js';
import { ApiService } from '../../../core/api.service.js';

describe('ProductInfoModalComponent', () => {
  let component: ProductInfoModalComponent;
  let fixture: ComponentFixture<ProductInfoModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
    backdropClick: { subscribe: vi.fn() },
    keydownEvents: { subscribe: vi.fn() },
  };

  const mockDialog = {
    open: vi.fn(),
    closeAll: vi.fn(),
  };

  const mockRouter = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  const mockApiService = {
    getProductRatings: vi.fn().mockResolvedValue({
      productId: 'p1',
      memberCount: 2,
      myRating: 4,
      otherMembersRatings: [
        { userId: 'u2', displayName: 'Alex', pictureUrl: null, rating: 5 },
        { userId: 'u3', displayName: 'Sam', pictureUrl: null, rating: null },
      ],
    }),
    getProductStores: vi.fn().mockResolvedValue([
      { storeId: 's1', aisle: '3A', aisleOrder: 3, averagePrice: 8.5 },
      { storeId: 's2', aisle: null, aisleOrder: null, averagePrice: null },
    ]),
    getAisles: vi.fn().mockResolvedValue([]),
    getProductCustomFields: vi.fn().mockResolvedValue([]),
    getMealieStatus: vi.fn().mockResolvedValue({ configured: false }),
  };

  const createMockData = (overrides: Record<string, unknown> = {}): ProductInfoModalData => ({
    product: {
      id: 'p1',
      name: 'Olive Oil',
      householdId: 'h1',
      description: 'Cold-pressed extra virgin olive oil.',
      pictureFileNames: ['oil-1.webp', 'oil-2.webp'],
      barcodes: ['8001234567890'],
      productGroupId: 'g1',
      defaultLocationId: 'l1',
      quStockId: 'u1',
      minStockAmount: 2,
      dueType: 'best_before',
      defaultBestBeforeDays: 365,
      cannotBeFrozen: false,
      active: true,
      ...overrides,
    } as any,
    allProducts: [],
    productGroups: [{ id: 'g1', name: 'Pantry Staples', householdId: 'h1' } as any],
    locations: [{ id: 'l1', name: 'Cupboard', isFreezer: false, householdId: 'h1' } as any],
    units: [{ id: 'u1', name: 'L', householdId: 'h1' } as any],
    stores: [
      { id: 's1', name: 'SuperMart', householdId: 'h1' } as any,
      { id: 's2', name: 'Corner Shop', householdId: 'h1' } as any,
    ],
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ProductInfoModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: createMockData() },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductInfoModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should start in info mode and allow switching to edit mode in-place', () => {
    expect(component.mode()).toBe('info');
    expect(fixture.nativeElement.querySelector('.product-info-shell')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-product-detail-view')).toBeFalsy();

    component.switchToEdit();
    fixture.detectChanges();
    expect(component.mode()).toBe('edit');
    expect(fixture.nativeElement.querySelector('app-product-detail-view')).toBeTruthy();
  });

  it('should return to info mode with updated product on save, and return saved result on close', () => {
    component.switchToEdit();
    const updated = { id: 'p1', name: 'Extra Virgin Olive Oil' } as any;
    component.onSaved({ product: updated, isNew: false });

    expect(component.mode()).toBe('info');
    expect(component.modalData().product?.name).toBe('Extra Virgin Olive Oil');

    component.close();
    expect(mockDialogRef.close).toHaveBeenCalledWith({ product: updated, isNew: false });
  });

  it('should close with false if nothing was saved', () => {
    component.close();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should display main info and photos immediately while keeping minor sections collapsed', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.product-title')?.textContent).toContain('Olive Oil');
    expect(el.querySelector('.product-description')?.textContent).toContain('Cold-pressed extra virgin olive oil.');
    expect(el.querySelector('.gallery-stage img')?.getAttribute('src')).toContain('oil-1.webp');
    expect(el.querySelectorAll('.gallery-thumbs .thumb-btn').length).toBe(2);

    // Switch photo via thumbnail
    component.selectPhoto(1);
    fixture.detectChanges();
    expect(el.querySelector('.gallery-stage img')?.getAttribute('src')).toContain('oil-2.webp');

    // Main spec cards are visible immediately
    expect(el.querySelectorAll('.spec-card').length).toBe(3);

    // Minor sections start collapsed
    expect(component.minorSections.barcodes).toBe(false);
    expect(component.minorSections.stores).toBe(false);
    expect(component.minorSections.ratings).toBe(false);

    // Unconfigured stores are filtered out
    expect(component.configuredStores().length).toBe(1);
    expect(component.configuredStores()[0].storeName).toBe('SuperMart');

    // Unrated household members are filtered out
    expect(component.ratedOtherMembers().length).toBe(1);
    expect(component.ratedOtherMembers()[0].displayName).toBe('Alex');
  });

  it('should open Relations and Stock modals from footer buttons and navigate to Pantry on group pill click', async () => {
    const el: HTMLElement = fixture.nativeElement;
    const stockBtn = el.querySelector('.info-footer .btn-stock') as HTMLButtonElement;
    const relationsBtn = el.querySelector('.info-footer .btn-relations') as HTMLButtonElement;
    const groupPill = el.querySelector('.meta-pill-group') as HTMLButtonElement;

    expect(stockBtn).toBeTruthy();
    expect(relationsBtn).toBeTruthy();
    expect(groupPill).toBeTruthy();

    stockBtn.click();
    expect(mockDialog.open).toHaveBeenCalledTimes(1);

    await component.openRelationsModal();
    expect(mockDialog.open).toHaveBeenCalledTimes(2);

    groupPill.click();
    expect(mockDialog.closeAll).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/pantry'], { queryParams: { group: 'g1' } });
  });

  it('should hide unpopulated fields and empty minor sections', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProductInfoModalComponent],
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: createMockData({
            description: '',
            pictureFileNames: [],
            barcodes: [],
            productGroupId: null,
            defaultLocationId: null,
            openLocationId: null,
            defaultStoreId: null,
            quStockId: null,
            minStockAmount: 0,
            defaultBestBeforeDays: 0,
            dueType: 'best_before',
          }),
        },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        {
          provide: ApiService,
          useValue: {
            ...mockApiService,
            getProductStores: vi.fn().mockResolvedValue([]),
            getProductRatings: vi.fn().mockResolvedValue({
              productId: 'p1',
              memberCount: 1,
              myRating: null,
              otherMembersRatings: [],
            }),
          },
        },
      ],
    }).compileComponents();

    const minimalFixture = TestBed.createComponent(ProductInfoModalComponent);
    minimalFixture.detectChanges();
    await minimalFixture.whenStable();
    minimalFixture.detectChanges();

    const el: HTMLElement = minimalFixture.nativeElement;
    expect(el.querySelector('.hero-gallery')).toBeFalsy();
    expect(el.querySelector('.product-description')).toBeFalsy();
    expect(el.querySelector('.specs-grid')).toBeFalsy();
    expect(el.querySelector('.minor-sections')).toBeFalsy();
  });

  it('shows only filled custom fields in spec-card when <= threshold and in collapsible when > threshold', async () => {
    mockApiService.getProductCustomFields.mockResolvedValueOnce([
      { id: 'cf1', householdId: 'h1', name: 'Origin', description: null, placeholder: null, type: 'string', defaultValue: null, sortOrder: 1 },
      { id: 'cf2', householdId: 'h1', name: 'Empty', description: null, placeholder: null, type: 'string', defaultValue: null, sortOrder: 2 },
      { id: 'cf3', householdId: 'h1', name: 'Organic', description: null, placeholder: null, type: 'boolean', defaultValue: null, sortOrder: 3 },
    ]);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProductInfoModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: createMockData({ customFields: { cf1: 'Italy', cf2: '', cf3: true } }) },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    const inlineFixture = TestBed.createComponent(ProductInfoModalComponent);
    inlineFixture.detectChanges();
    await inlineFixture.whenStable();
    inlineFixture.detectChanges();

    expect(inlineFixture.componentInstance.filledCustomFields().map((i) => i.field.id)).toEqual(['cf1', 'cf3']);
    expect(inlineFixture.componentInstance.shouldCollapseCustomFields()).toBe(false);
    expect(inlineFixture.nativeElement.querySelector('.custom-fields-spec-card')).toBeTruthy();

    // > 4 filled fields -> collapsible
    mockApiService.getProductCustomFields.mockResolvedValueOnce([
      { id: 'cf1', householdId: 'h1', name: 'F1', description: null, placeholder: null, type: 'string', defaultValue: null, sortOrder: 1 },
      { id: 'cf2', householdId: 'h1', name: 'F2', description: null, placeholder: null, type: 'string', defaultValue: null, sortOrder: 2 },
      { id: 'cf3', householdId: 'h1', name: 'F3', description: null, placeholder: null, type: 'int', defaultValue: null, sortOrder: 3 },
      { id: 'cf4', householdId: 'h1', name: 'F4', description: null, placeholder: null, type: 'double', defaultValue: null, sortOrder: 4 },
      { id: 'cf5', householdId: 'h1', name: 'F5', description: null, placeholder: null, type: 'boolean', defaultValue: null, sortOrder: 5 },
    ]);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProductInfoModalComponent],
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: createMockData({ customFields: { cf1: 'A', cf2: 'B', cf3: 10, cf4: 2.5, cf5: true } }),
        },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    const collapsedFixture = TestBed.createComponent(ProductInfoModalComponent);
    collapsedFixture.detectChanges();
    await collapsedFixture.whenStable();
    collapsedFixture.detectChanges();

    expect(collapsedFixture.componentInstance.shouldCollapseCustomFields()).toBe(true);
    expect(collapsedFixture.nativeElement.querySelector('.custom-fields-spec-card')).toBeFalsy();
  });
});
