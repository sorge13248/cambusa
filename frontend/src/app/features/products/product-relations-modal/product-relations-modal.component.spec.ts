import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductRelationsModalComponent, ProductRelationsModalData } from './product-relations-modal.component.js';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ProductEditorModalComponent } from '../product-editor-modal/product-editor-modal.component.js';
import { ProductStockModalComponent } from '../product-stock-modal/product-stock-modal.component.js';
import { of } from 'rxjs';

describe('ProductRelationsModalComponent', () => {
  let component: ProductRelationsModalComponent;
  let fixture: ComponentFixture<ProductRelationsModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  const mockProducts = [
    {
      id: 'root-fruit',
      name: 'Fruit',
      parentProductId: null,
      directStockAmount: 0,
      aggregatedStockAmount: 10,
    },
    {
      id: 'fresh-fruit',
      name: 'Fresh Fruit',
      parentProductId: 'root-fruit',
      directStockAmount: 2,
      aggregatedStockAmount: 10,
    },
    {
      id: 'target-bananas',
      name: 'Bananas',
      parentProductId: 'fresh-fruit',
      directStockAmount: 5,
      aggregatedStockAmount: 8,
    },
    {
      id: 'child-organic-bananas',
      name: 'Organic Bananas',
      parentProductId: 'target-bananas',
      directStockAmount: 3,
      aggregatedStockAmount: 3,
      barcodes: ['80012345'],
    },
    {
      id: 'child-mini-bananas',
      name: 'Baby Bananas',
      parentProductId: 'target-bananas',
      directStockAmount: 0,
      aggregatedStockAmount: 0,
    },
  ];

  const mockData: ProductRelationsModalData = {
    product: mockProducts[2] as any, // Bananas
    allProducts: mockProducts as any,
    productGroups: [{ id: 'g1', name: 'Produce' } as any],
    locations: [{ id: 'l1', name: 'Kitchen' } as any],
    units: [{ id: 'u1', name: 'Kg' } as any],
    stores: [{ id: 's1', name: 'Market' } as any],
  };

  beforeEach(async () => {
    mockDialogRef.close.mockClear();
    mockDialog.open.mockClear();

    await TestBed.configureTestingModule({
      imports: [ProductRelationsModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductRelationsModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve parent ancestors and child products', () => {
    expect(component).toBeTruthy();
    expect(component.currentProduct().name).toBe('Bananas');

    // Ancestors should be [Fruit, Fresh Fruit]
    const ancestors = component.ancestorProducts();
    expect(ancestors.length).toBe(2);
    expect(ancestors[0].name).toBe('Fruit');
    expect(ancestors[1].name).toBe('Fresh Fruit');
    expect(component.directParent()?.name).toBe('Fresh Fruit');

    // Children should be [Organic Bananas, Baby Bananas]
    const children = component.childProducts();
    expect(children.length).toBe(2);
    expect(children.map((c) => c.name)).toContain('Organic Bananas');
    expect(children.map((c) => c.name)).toContain('Baby Bananas');
  });

  it('should open stock modal when openStockModal is called', () => {
    const parent = component.ancestorProducts()[1];
    component.openStockModal(parent);

    expect(mockDialog.open).toHaveBeenCalledWith(
      ProductStockModalComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          product: parent,
        }),
      }),
    );
  });

  it('should open edit modal when openEditProductModal is called and handle update', async () => {
    const child = component.childProducts()[0];
    const updatedChild = { ...child, name: 'Super Organic Bananas' };
    mockDialog.open.mockReturnValue({
      closed: of({ product: updatedChild }),
    });

    component.openEditProductModal(child);
    await Promise.resolve();

    expect(mockDialog.open).toHaveBeenCalledWith(
      ProductEditorModalComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          product: child,
        }),
      }),
    );

    expect(component.hasChanges).toBe(true);
    expect(component.childProducts().find((c) => c.id === child.id)?.name).toBe(
      'Super Organic Bananas',
    );
  });

  it('should close dialog and pass changes', () => {
    component.hasChanges = true;
    component.close();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      hasChanges: true,
      products: component.allProductsList(),
    });
  });
});
