import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ProductEditorModalComponent, ProductEditorModalData } from './product-editor-modal.component.js';
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
    getProductStores: vi.fn().mockResolvedValue([]),
    getAisles: vi.fn().mockResolvedValue([]),
    getMealieStatus: vi.fn().mockResolvedValue({ configured: false }),
  };

  const mockData: ProductEditorModalData = {
    product: null,
    allProducts: [],
    productGroups: [],
    locations: [],
    units: [],
    stores: [],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
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

  it('should create and render ProductDetailViewComponent in edit mode', () => {
    expect(component).toBeTruthy();
    expect(component.detailView()).toBeTruthy();
    expect(component.detailView()).toBeTruthy();
  });

  it('should close dialog with saved result when detail view emits saved', () => {
    const payload = { product: { id: 'p1', name: 'Pasta' } as any, isNew: true };
    component.onSaved(payload);
    expect(mockDialogRef.close).toHaveBeenCalledWith(payload);
  });

  it('should close dialog with false when detail view emits cancelled', () => {
    component.onCancelled();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });
});
