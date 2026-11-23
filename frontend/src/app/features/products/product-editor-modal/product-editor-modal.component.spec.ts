import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { ProductEditorModalComponent, ProductEditorModalData } from './product-editor-modal.component.js';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/api.service.js';

describe('ProductEditorModalComponent', () => {
  let component: ProductEditorModalComponent;
  let fixture: ComponentFixture<ProductEditorModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
    backdropClick: { subscribe: vi.fn() },
    keydownEvents: { subscribe: vi.fn() },
  };

  const mockDialog = {
    open: vi.fn(),
  };

  const mockApiService = {
    createProduct: vi.fn().mockResolvedValue({ id: 'p1', name: 'New Product' }),
    updateProduct: vi.fn().mockResolvedValue({ id: 'p1', name: 'Updated Product' }),
    getProduct: vi.fn().mockResolvedValue({ id: 'p1', name: 'Updated Product' }),
    uploadProductPicture: vi.fn().mockResolvedValue({ fileName: 'pic1.webp' }),
    deleteProductPicture: vi.fn().mockResolvedValue(undefined),
    reorderProductPictures: vi.fn().mockResolvedValue(undefined),
    setProductStore: vi.fn().mockResolvedValue(undefined),
    getMealieStatus: vi.fn().mockResolvedValue({ configured: true, mealieUrl: 'https://mealie.local' }),
  };

  const mockData: ProductEditorModalData = {
    product: null,
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
    await TestBed.configureTestingModule({
      imports: [ProductEditorModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductEditorModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle all sections', () => {
    expect(component.allExpanded()).toBe(false);
    component.toggleAllSections();
    expect(component.allExpanded()).toBe(true);
    expect(component.sections.basic).toBe(true);
    component.toggleAllSections();
    expect(component.allExpanded()).toBe(false);
    expect(component.sections.basic).toBe(false);
  });

  it('should add and remove barcodes', () => {
    component.newBarcodeInput = '1234567890';
    component.addBarcode();
    expect(component.barcodes()).toContain('1234567890');
    expect(component.newBarcodeInput).toBe('');

    component.removeBarcode(0);
    expect(component.barcodes().length).toBe(0);
  });

  it('should manage linked foods and recipes', () => {
    component.linkedFoods.set([{ id: 'f1', name: 'Carrot' }]);
    component.linkedRecipes.set([{ id: 'r1', slug: 'soup', name: 'Soup' }]);

    expect(component.mealieBadge()).toBe('2 linked');

    component.removeLinkedFood(0);
    expect(component.linkedFoods().length).toBe(0);
    expect(component.mealieBadge()).toBe('1 linked');

    component.removeLinkedRecipe(0);
    expect(component.linkedRecipes().length).toBe(0);
    expect(component.mealieBadge()).toBe('');
  });

  it('should compute inherited foods and recipes from parent product', () => {
    component.selectedParentProductId = 'p2';
    expect(component.inheritedFoods().length).toBe(1);
    expect(component.inheritedFoods()[0].id).toBe('f-parent');
    expect(component.inheritedRecipes().length).toBe(1);
    expect(component.inheritedRecipes()[0].id).toBe('r-parent');
    expect(component.mealieBadge()).toBe('0 linked (+2 inherited)');

    component.linkedFoods.set([{ id: 'f-direct', name: 'Direct Food' }]);
    expect(component.mealieBadge()).toBe('1 linked (+2 inherited)');
  });

  it('should open link food modal and add multiple selected foods', async () => {
    mockDialog.open.mockReturnValue({
      closed: of([
        { id: 'f1', name: 'Apple' },
        { id: 'f2', name: 'Banana' },
      ]),
    });

    await component.openLinkFoodModal();
    expect(component.linkedFoods().length).toBe(2);
    expect(component.linkedFoods()[0].name).toBe('Apple');
    expect(component.linkedFoods()[1].name).toBe('Banana');
  });

  it('should open link recipe modal and add multiple selected recipes', async () => {
    mockDialog.open.mockReturnValue({
      closed: of([
        { id: 'r1', slug: 'pasta', name: 'Pasta' },
        { id: 'r2', slug: 'pizza', name: 'Pizza' },
      ]),
    });

    await component.openLinkRecipeModal();
    expect(component.linkedRecipes().length).toBe(2);
    expect(component.linkedRecipes()[0].slug).toBe('pasta');
    expect(component.linkedRecipes()[1].slug).toBe('pizza');
  });

  it('should save product and close modal', async () => {
    component.formProduct.name = 'Test Pasta';
    await component.saveProduct();
    expect(mockApiService.createProduct).toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      product: expect.objectContaining({ id: 'p1' }),
      isNew: true,
    });
  });
});
