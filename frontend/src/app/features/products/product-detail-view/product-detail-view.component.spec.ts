import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { ProductDetailViewComponent, ProductEditorModalData } from './product-detail-view.component.js';
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
    uploadProductPicture: vi.fn().mockResolvedValue({ fileName: 'pic1.webp' }),
    deleteProductPicture: vi.fn().mockResolvedValue(undefined),
    reorderProductPictures: vi.fn().mockResolvedValue(undefined),
    setProductStore: vi.fn().mockResolvedValue(undefined),
    getAisles: vi.fn().mockResolvedValue([]),
    getProductCustomFields: vi.fn().mockResolvedValue([
      {
        id: 'cf1',
        householdId: 'h1',
        name: 'Origin',
        description: 'Country of origin',
        placeholder: 'e.g. Italy',
        type: 'string',
        defaultValue: 'Italy',
        sortOrder: 1,
      },
      {
        id: 'cf2',
        householdId: 'h1',
        name: 'Organic',
        description: null,
        placeholder: null,
        type: 'boolean',
        defaultValue: 'false',
        sortOrder: 2,
      },
    ]),
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
    fixture.componentRef.setInput('data', mockData);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should render in edit mode with enabled inputs and custom field defaults', () => {
    const nameInput = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput.disabled).toBe(false);
    expect(component.customFieldDefinitions().length).toBe(2);
    expect(component.customFieldValues['cf1']).toBe('Italy');
    expect(component.customFieldValues['cf2']).toBe(false);
  });

  it('should save product including customFields and emit saved event', async () => {
    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);

    component.formProduct.name = 'Updated Olive Oil';
    component.customFieldValues['cf1'] = 'Spain';
    component.customFieldValues['cf2'] = true;
    await component.saveProduct();

    expect(mockApiService.updateProduct).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        name: 'Updated Olive Oil',
        customFields: { cf1: 'Spain', cf2: true },
      }),
    );
    expect(savedSpy).toHaveBeenCalledWith({
      product: expect.objectContaining({ id: 'p1' }),
      isNew: false,
    });
  });

  it('should confirm before cancelling if dirty', async () => {
    component.formProduct.name = 'Changed Name';
    mockDialog.open.mockReturnValue({ closed: of(true) });
    const cancelSpy = vi.fn();
    component.cancelled.subscribe(cancelSpy);

    await component.cancel();
    expect(mockDialog.open).toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalled();
  });
});
