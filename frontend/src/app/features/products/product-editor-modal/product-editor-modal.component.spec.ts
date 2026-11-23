import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  };

  const mockData: ProductEditorModalData = {
    product: null,
    allProducts: [{ id: 'p2', name: 'Existing Product', hierarchyPath: 'Existing Product' } as any],
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
