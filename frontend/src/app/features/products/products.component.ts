import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import {
  Location,
  Product,
  ProductGroup,
  QuantityUnit,
  Store,
} from '../../core/models.js';
import { ProductEditorModalComponent } from './product-editor-modal/product-editor-modal.component.js';
import { ProductStockModalComponent } from './product-stock-modal/product-stock-modal.component.js';
import { ProductRelationsModalComponent } from './product-relations-modal/product-relations-modal.component.js';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal.component.js';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
})
export class ProductsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly products = signal<Product[]>([]);
  readonly filteredProducts = signal<Product[]>([]);
  readonly productGroups = signal<ProductGroup[]>([]);
  readonly locations = signal<Location[]>([]);
  readonly units = signal<QuantityUnit[]>([]);
  readonly stores = signal<Store[]>([]);
  readonly isLoading = signal<boolean>(true);

  // Filters state
  readonly searchQuery = signal<string>('');
  filterGroupId = '';
  filterStatus = 'all';

  // Pagination state
  readonly currentPage = signal<number>(1);
  readonly pageSize = 24;

  readonly totalItems = computed(() => this.filteredProducts().length);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize)));
  readonly Math = Math;
  readonly paginatedProducts = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredProducts().slice(start, start + this.pageSize);
  });

  private subs = new Subscription();

  constructor() {
    effect(() => {
      const hhId = this.auth.activeHouseholdId();
      if (hhId) {
        this.loadData();
      }
    });
  }

  ngOnInit() {
    this.subs.add(
      this.route.queryParams.subscribe((params) => {
        this.searchQuery.set(params['q'] || '');
        this.filterGroupId = params['group'] || '';
        this.filterStatus = params['status'] || 'all';
        const p = parseInt(params['page'], 10);
        this.currentPage.set(!isNaN(p) && p > 0 ? p : 1);

        if (this.products().length > 0) {
          this.applyFilter();
        }
      }),
    );

    this.loadData();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const [prods, groups, locs, units, stores] = await Promise.all([
        this.api.getProducts(true),
        this.api.getGroups(),
        this.api.getLocations(),
        this.api.getUnits(),
        this.api.getStores(),
      ]);

      this.products.set(prods);
      this.productGroups.set(groups);
      this.locations.set(locs);
      this.units.set(units);
      this.stores.set(stores);

      this.applyFilter();
    } finally {
      this.isLoading.set(false);
    }
  }

  onFilterChange() {
    this.currentPage.set(1);
    this.syncQueryParams();
    this.applyFilter();
  }

  onSearchChange(val: string) {
    this.searchQuery.set(val);
    this.currentPage.set(1);
    this.syncQueryParams();
    this.applyFilter();
  }

  clearSearch() {
    this.searchQuery.set('');
    this.currentPage.set(1);
    this.syncQueryParams();
    this.applyFilter();
  }

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages()) return;
    this.currentPage.set(p);
    this.syncQueryParams();
  }

  syncQueryParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchQuery().trim() || null,
        group: this.filterGroupId || null,
        status: this.filterStatus !== 'all' ? this.filterStatus : null,
        page: this.currentPage() > 1 ? this.currentPage() : null,
      },
      queryParamsHandling: 'merge',
    });
  }

  applyFilter() {
    let list = [...this.products()];
    const q = this.searchQuery().trim().toLowerCase();

    // 1. Text Search (name, barcode, description, hierarchyPath)
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcodes?.some((bc) => bc.toLowerCase().includes(q)) ||
          p.hierarchyPath?.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q),
      );
    }

    // 2. Category Filter
    if (this.filterGroupId) {
      list = list.filter((p) => p.productGroupId === this.filterGroupId);
    }

    // 3. Status Filter (Active / Inactive)
    if (this.filterStatus === 'active') {
      list = list.filter((p) => p.active !== false);
    } else if (this.filterStatus === 'inactive') {
      list = list.filter((p) => p.active === false);
    }

    this.filteredProducts.set(list);

    if (this.products().length > 0) {
      const totalP = Math.max(1, Math.ceil(list.length / this.pageSize));
      if (this.currentPage() > totalP) {
        this.currentPage.set(totalP);
      }
    }
  }

  getStoreName(storeId: string): string {
    return this.stores().find((s) => s.id === storeId)?.name ?? 'Store';
  }

  openAddProductModal() {
    const dialogRef = this.dialog.open(ProductEditorModalComponent, {
      disableClose: true,
      data: {
        product: null,
        allProducts: this.products(),
        productGroups: this.productGroups(),
        locations: this.locations(),
        units: this.units(),
        stores: this.stores(),
      },
    });

    firstValueFrom(dialogRef.closed).then((res: any) => {
      if (res) {
        if (typeof res === 'object' && res.product) {
          const { product, isNew } = res;
          const currentList = this.products();
          if (isNew) {
            this.products.set([product, ...currentList]);
          } else {
            this.products.set(currentList.map((item) => (item.id === product.id ? product : item)));
          }
          this.applyFilter();
        } else {
          this.loadData();
        }
      }
    });
  }

  openEditProductModal(p: Product) {
    const dialogRef = this.dialog.open(ProductEditorModalComponent, {
      disableClose: true,
      data: {
        product: p,
        allProducts: this.products(),
        productGroups: this.productGroups(),
        locations: this.locations(),
        units: this.units(),
        stores: this.stores(),
      },
    });

    firstValueFrom(dialogRef.closed).then((res: any) => {
      if (res) {
        if (typeof res === 'object' && res.product) {
          const { product } = res;
          this.products.set(this.products().map((item) => (item.id === product.id ? product : item)));
          this.applyFilter();
        } else {
          this.loadData();
        }
      }
    });
  }

  openProductStockModal(p: Product) {
    this.dialog.open(ProductStockModalComponent, {
      data: {
        product: p,
        units: this.units(),
        locations: this.locations(),
        allProducts: this.products(),
      },
    });
  }

  openProductRelationsModal(p: Product) {
    const dialogRef = this.dialog.open(ProductRelationsModalComponent, {
      data: {
        product: p,
        allProducts: this.products(),
        productGroups: this.productGroups(),
        locations: this.locations(),
        units: this.units(),
        stores: this.stores(),
      },
    });

    firstValueFrom(dialogRef.closed).then((res: any) => {
      if (res?.hasChanges) {
        if (res.products) {
          this.products.set(res.products);
          this.applyFilter();
        } else {
          this.loadData();
        }
      }
    });
  }

  async confirmDeleteProduct(p: Product) {
    const confirmRef = this.dialog.open(ConfirmModalComponent, {
      data: {
        title: 'Delete Product',
        message: `Are you sure you want to delete "${p.name}"? This action cannot be undone.`,
        confirmLabel: 'Delete Product',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await firstValueFrom(confirmRef.closed);
    if (!confirmed) return;

    try {
      await this.api.deleteProduct(p.id);
      this.products.set(this.products().filter((item) => item.id !== p.id));
      this.applyFilter();
    } catch (err) {
      console.error('Failed to delete product:', err);
    }
  }
}
