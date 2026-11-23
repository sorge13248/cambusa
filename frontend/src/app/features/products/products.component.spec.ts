import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductsComponent } from './products.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { ProductStockModalComponent } from './product-stock-modal/product-stock-modal.component.js';
import { ProductRelationsModalComponent } from './product-relations-modal/product-relations-modal.component.js';

describe('ProductsComponent', () => {
  let component: ProductsComponent;
  let fixture: ComponentFixture<ProductsComponent>;

  const mockApiService = {
    getProducts: vi.fn().mockResolvedValue([
      { id: 'p1', name: 'Pasta Garofalo', description: '<p>Delicious pasta</p>', barcodes: ['800123'], active: true },
      { id: 'p2', name: 'Old Vinegar', description: 'Archived bottle', barcodes: ['800999'], active: false },
    ]),
    getGroups: vi.fn().mockResolvedValue([{ id: 'g1', name: 'Pantry' }]),
    getLocations: vi.fn().mockResolvedValue([{ id: 'l1', name: 'Cupboard' }]),
    getUnits: vi.fn().mockResolvedValue([{ id: 'u1', name: 'Pack' }]),
    getStores: vi.fn().mockResolvedValue([{ id: 's1', name: 'Coop' }]),
    deleteProduct: vi.fn().mockResolvedValue(undefined),
  };

  const mockAuthService = {
    activeHouseholdId: signal('h1'),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: mockApiService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: Dialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load products', () => {
    expect(component).toBeTruthy();
    expect(mockApiService.getProducts).toHaveBeenCalled();
    expect(component.products().length).toBe(2);
    expect(component.filteredProducts().length).toBe(2);
  });

  it('should filter products by query', () => {
    component.onSearchChange('garofalo');
    expect(component.filteredProducts().length).toBe(1);
    expect(component.filteredProducts()[0].name).toBe('Pasta Garofalo');

    component.onSearchChange('nonexistent');
    expect(component.filteredProducts().length).toBe(0);

    component.clearSearch();
    expect(component.filteredProducts().length).toBe(2);
  });

  it('should filter products by status (active vs inactive)', () => {
    component.filterStatus = 'active';
    component.applyFilter();
    expect(component.filteredProducts().length).toBe(1);
    expect(component.filteredProducts()[0].name).toBe('Pasta Garofalo');

    component.filterStatus = 'inactive';
    component.applyFilter();
    expect(component.filteredProducts().length).toBe(1);
    expect(component.filteredProducts()[0].name).toBe('Old Vinegar');

    component.filterStatus = 'all';
    component.applyFilter();
    expect(component.filteredProducts().length).toBe(2);
  });

  it('should handle pagination correctly', () => {
    // Generate 30 mock products
    const manyProducts = Array.from({ length: 30 }, (_, i) => ({
      id: `p-${i}`,
      name: `Product ${i + 1}`,
      active: true,
    }));
    component.products.set(manyProducts as any);
    component.applyFilter();

    expect(component.totalItems()).toBe(30);
    expect(component.totalPages()).toBe(2);
    expect(component.paginatedProducts().length).toBe(24);

    component.goToPage(2);
    expect(component.currentPage()).toBe(2);
    expect(component.paginatedProducts().length).toBe(6);
  });

  it('should open product stock modal when openProductStockModal is called', () => {
    const product = component.products()[0];
    component.openProductStockModal(product);

    expect(mockDialog.open).toHaveBeenCalledWith(
      ProductStockModalComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          product,
          units: component.units(),
          locations: component.locations(),
          allProducts: component.products(),
        }),
      }),
    );
  });

  it('should open product relations modal when openProductRelationsModal is called', () => {
    const product = component.products()[0];
    mockDialog.open.mockReturnValue({
      closed: of({ hasChanges: false }),
    });

    component.openProductRelationsModal(product);

    expect(mockDialog.open).toHaveBeenCalledWith(
      ProductRelationsModalComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          product,
          allProducts: component.products(),
          productGroups: component.productGroups(),
          locations: component.locations(),
          units: component.units(),
          stores: component.stores(),
        }),
      }),
    );
  });
});
