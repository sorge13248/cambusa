import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { ProductDetailViewComponent } from './product-detail-view.component.js';
import { ProductEditorModalData } from './product-detail-view.component.js';
import { ApiService } from '../../../core/api.service.js';

describe('ProductDetailViewComponent', () => {
  let component: ProductDetailViewComponent;
  let fixture: ComponentFixture<ProductDetailViewComponent>;

  const mockDialog = {
    open: vi.fn(),
  };

  const mockApiService = {
    createProduct: vi.fn().mockResolvedValue({ id: 'p1', name: 'New Product' }),
    updateProduct: vi.fn().mockResolvedValue({ id: 'p1', name: 'Updated Product' }),
    getProduct: vi.fn().mockResolvedValue({ id: 'p1', name: 'Updated Product' }),
    getProductStores: vi.fn().mockResolvedValue([]),
    getProductRatings: vi.fn().mockResolvedValue({
      productId: 'p1',
      memberCount: 2,
      myRating: 4,
      otherMembersRatings: [
        {
          userId: 'u2',
          displayName: 'Alice',
          pictureUrl: 'https://example.com/alice.png',
          rating: 5,
          updatedAt: '2026-11-25T10:00:00Z',
        },
      ],
    }),
    setProductRating: vi.fn().mockResolvedValue({
      productId: 'p1',
      userId: 'u1',
      rating: 5,
      updatedAt: '2026-11-25T10:01:00Z',
    }),
    uploadProductPicture: vi.fn().mockResolvedValue({ fileName: 'pic1.webp' }),
    deleteProductPicture: vi.fn().mockResolvedValue(undefined),
    reorderProductPictures: vi.fn().mockResolvedValue(undefined),
    setProductStore: vi.fn().mockResolvedValue(undefined),
    getAisles: vi.fn().mockResolvedValue([]),
    getMealieStatus: vi.fn().mockResolvedValue({ configured: true, mealieUrl: 'https://mealie.local' }),
  };

  const mockData: ProductEditorModalData = {
    product: {
      id: 'p1',
      name: 'Olive Oil',
      householdId: 'h1',
      barcodes: ['800123'],
      pictureFileNames: [],
      mealieFoods: [],
      mealieRecipes: [],
    } as any,
    allProducts: [
      {
        id: 'p2',
        name: 'Parent Product',
        hierarchyPath: 'Parent Product',
        mealieFoods: [{ id: 'f-parent', name: 'Parent Food' }],
        mealieRecipes: [{ id: 'r-parent', slug: 'parent-recipe', name: 'Parent Recipe' }],
      } as any,
    ],
    productGroups: [],
    locations: [],
    units: [],
    stores: [],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ProductDetailViewComponent],
      providers: [
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductDetailViewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('mode', 'info');
    fixture.componentRef.setInput('data', mockData);
    fixture.componentRef.setInput('showEditSwitch', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should render in info mode with Your Rating and collapsed Household Member Ratings when memberCount > 1', () => {
    expect(component.isInfoMode()).toBe(true);
    expect(component.myRating()).toBe(4);
    expect(component.showOtherMembersRatings()).toBe(true);
    expect(component.sections.ratings).toBe(false);

    const ratingCard = fixture.nativeElement.querySelector('.your-rating-card');
    expect(ratingCard).toBeTruthy();

    const nameInput = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);

    const editSwitchBtn = fixture.nativeElement.querySelector('.btn-switch-edit') as HTMLButtonElement;
    expect(editSwitchBtn).toBeTruthy();
  });

  it('should hide Household Member Ratings when memberCount <= 1', async () => {
    mockApiService.getProductRatings.mockResolvedValueOnce({
      productId: 'p1',
      memberCount: 1,
      myRating: 3,
      otherMembersRatings: [],
    });

    const singleFixture = TestBed.createComponent(ProductDetailViewComponent);
    singleFixture.componentRef.setInput('mode', 'info');
    singleFixture.componentRef.setInput('data', mockData);
    singleFixture.detectChanges();
    await singleFixture.whenStable();
    singleFixture.detectChanges();

    expect(singleFixture.componentInstance.showOtherMembersRatings()).toBe(false);
    expect(singleFixture.nativeElement.textContent).not.toContain('Household Member Ratings');
  });

  it('should emit editRequested when clicking the Edit switch button', () => {
    const spy = vi.fn();
    component.editRequested.subscribe(spy);
    const editBtn = fixture.nativeElement.querySelector('.btn-switch-edit') as HTMLButtonElement;
    editBtn.click();
    expect(spy).toHaveBeenCalled();
  });

  it('should update rating via ApiService when onMyRatingChange is called', async () => {
    await component.onMyRatingChange(5);
    expect(mockApiService.setProductRating).toHaveBeenCalledWith('p1', 5);
    expect(component.myRating()).toBe(5);
  });

  it('should save product in edit mode and emit saved event', async () => {
    fixture.componentRef.setInput('mode', 'edit');
    fixture.detectChanges();

    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);

    component.formProduct.name = 'Updated Olive Oil';
    await component.saveProduct();

    expect(mockApiService.updateProduct).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalledWith({
      product: expect.objectContaining({ id: 'p1' }),
      isNew: false,
    });
  });

  it('should confirm before cancelling if dirty in edit mode', async () => {
    fixture.componentRef.setInput('mode', 'edit');
    fixture.detectChanges();

    component.formProduct.name = 'Changed Name';
    mockDialog.open.mockReturnValue({ closed: of(true) });
    const cancelSpy = vi.fn();
    component.cancelled.subscribe(cancelSpy);

    await component.cancel();
    expect(mockDialog.open).toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalled();
  });
});
