import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  LucideCheck,
  LucideLockOpen,
  LucideMapPin,
  LucidePackage,
  LucideX,
  LucideZap,
} from '@lucide/angular';
import {
  FilterConfig,
  Location,
  Product,
  ProductGroup,
  QuantityUnit,
  SavedFilter,
  StockItem,
} from '../../../core/models.js';
import { QuickDateModifierComponent } from '../quick-date-modifier/quick-date-modifier.component.js';
import { buildAggregatedStockMap } from '../../../core/stock-utils.js';

export interface PantryCardItem {
  id: string; // productId
  productId: string;
  productName: string;
  productPictureFileName?: string | null;
  productGroupId?: string | null;
  totalAmount: number;
  quName?: string | null;
  bestBeforeDate?: string | null;
  urgency?: string;
  isOpen: boolean;
  openedCount?: number;
  locationName: string;
  locationIds: string[];
  isOutOfStock?: boolean;
  primaryStockItem: StockItem | null;
  batches: StockItem[];
}

@Component({
  selector: 'app-pantry-inventory-grid',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    QuickDateModifierComponent,
    LucideCheck,
    LucideLockOpen,
    LucideMapPin,
    LucidePackage,
    LucideX,
    LucideZap,
  ],
  templateUrl: './pantry-inventory-grid.component.html',
  styleUrl: './pantry-inventory-grid.component.scss',
})
export class PantryInventoryGridComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly mode = input<'pantry' | 'picker'>('pantry');
  readonly stock = input<StockItem[]>([]);
  readonly products = input<Product[]>([]);
  readonly locations = input<Location[]>([]);
  readonly productGroups = input<ProductGroup[]>([]);
  readonly units = input<QuantityUnit[]>([]);
  readonly savedFilters = input<SavedFilter[]>([]);
  readonly isLoading = input<boolean>(false);
  readonly expiringSoonDays = input<number>(5);
  readonly syncUrlParams = input<boolean>(true);
  readonly selectedProductIds = input<string[]>([]);

  readonly cardSelected = output<PantryCardItem>();
  readonly dateAdjusted = output<{ item: PantryCardItem; newDate: string | null }>();
  readonly openOneClicked = output<PantryCardItem>();
  readonly consumeOneClicked = output<PantryCardItem>();
  readonly addStockClicked = output<void>();
  readonly deleteSavedFilterClicked = output<string>();

  readonly filteredStock = signal<PantryCardItem[]>([]);
  selectedGroupId = '';
  selectedLocationId = '';
  selectedStatus = 'all';
  sortBy = 'bestBeforeDate';
  readonly searchQuery = signal<string>('');
  readonly hasActiveFilters = signal<boolean>(false);

  readonly currentPage = signal<number>(1);
  readonly pageSize = 24;

  readonly totalItems = computed(() => this.filteredStock().length);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize)));
  readonly paginatedStock = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredStock().slice(start, start + this.pageSize);
  });

  readonly selectedProductIdSet = computed(() => new Set(this.selectedProductIds()));

  private subs = new Subscription();
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      // Re-run filtering whenever inputs change
      this.stock();
      this.products();
      this.locations();
      this.units();
      this.expiringSoonDays();
      untracked(() => this.applyLocalFilters());
    });
  }

  ngOnInit(): void {
    if (this.syncUrlParams()) {
      this.subs.add(
        this.route.queryParams.subscribe((params) => {
          this.cancelSearchDebounce();
          this.selectedGroupId = params['group'] || '';
          this.selectedLocationId = params['location'] || '';
          this.selectedStatus = params['status'] || 'all';
          this.sortBy = params['sort'] || 'bestBeforeDate';
          this.searchQuery.set(params['q'] || '');
          const p = parseInt(params['page'], 10);
          this.currentPage.set(!isNaN(p) && p > 0 ? p : 1);

          if (this.stock().length > 0 || this.products().length > 0) {
            this.applyLocalFilters();
          }
        }),
      );
    }
  }

  ngOnDestroy(): void {
    this.cancelSearchDebounce();
    this.subs.unsubscribe();
  }

  clearAllFilters(): void {
    this.cancelSearchDebounce();
    this.searchQuery.set('');
    this.selectedGroupId = '';
    this.selectedLocationId = '';
    this.selectedStatus = 'all';
    this.sortBy = 'bestBeforeDate';
    this.currentPage.set(1);
    this.syncQueryParams();
    this.applyLocalFilters();
  }

  onFilterChange(): void {
    this.cancelSearchDebounce();
    this.currentPage.set(1);
    this.syncQueryParams();
    this.applyLocalFilters();
  }

  onSearchChange(val: string): void {
    this.searchQuery.set(val);
    this.currentPage.set(1);
    this.applyLocalFilters();
    if (this.syncUrlParams()) {
      this.debounceSyncQueryParams(1000);
    }
  }

  clearSearch(): void {
    this.cancelSearchDebounce();
    this.searchQuery.set('');
    this.currentPage.set(1);
    this.syncQueryParams();
    this.applyLocalFilters();
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.cancelSearchDebounce();
    this.currentPage.set(p);
    this.syncQueryParams();
    if (this.mode() === 'pantry' && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  private debounceSyncQueryParams(delayMs = 1000): void {
    this.cancelSearchDebounce();
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.syncQueryParams();
    }, delayMs);
  }

  private cancelSearchDebounce(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  syncQueryParams(): void {
    if (!this.syncUrlParams()) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        group: this.selectedGroupId || null,
        location: this.selectedLocationId || null,
        status: this.selectedStatus !== 'all' ? this.selectedStatus : null,
        sort: this.sortBy && this.sortBy !== 'bestBeforeDate' ? this.sortBy : null,
        q: this.searchQuery().trim() || null,
        page: this.currentPage() > 1 ? this.currentPage() : null,
      },
      queryParamsHandling: 'merge',
    });
  }

  getFilterConfig(): FilterConfig {
    return {
      productGroupIds: this.selectedGroupId ? [this.selectedGroupId] : undefined,
      locationIds: this.selectedLocationId ? [this.selectedLocationId] : undefined,
      status: this.selectedStatus as any,
      sortBy: this.sortBy as any,
    };
  }

  applySavedFilter(sf: SavedFilter): void {
    let c: FilterConfig;
    try {
      c = typeof sf.filterConfig === 'string' ? JSON.parse(sf.filterConfig) : sf.filterConfig;
    } catch {
      c = {};
    }
    this.selectedGroupId = (c.productGroupIds && c.productGroupIds[0]) || '';
    this.selectedLocationId = (c.locationIds && c.locationIds[0]) || '';
    this.selectedStatus = c.status || 'all';
    this.sortBy = c.sortBy || 'bestBeforeDate';
    this.currentPage.set(1);
    this.syncQueryParams();
    this.applyLocalFilters();
  }

  applyLocalFilters(): void {
    const allStock = this.stock();
    const query = this.searchQuery().trim().toLowerCase();
    const expDays = this.expiringSoonDays();

    this.hasActiveFilters.set(
      this.searchQuery().trim().length > 0 ||
        this.selectedGroupId !== '' ||
        this.selectedLocationId !== '' ||
        this.selectedStatus !== 'all' ||
        this.sortBy !== 'bestBeforeDate',
    );

    const groupedMap = new Map<string, StockItem[]>();
    for (const item of allStock) {
      const list = groupedMap.get(item.productId) || [];
      list.push(item);
      groupedMap.set(item.productId, list);
    }

    const prodMap = new Map(this.products().map((p) => [p.id, p]));
    const unitMap = new Map(this.units().map((u) => [u.id, u]));
    const locMap = new Map(this.locations().map((l) => [l.id, l]));
    const directStockMap = new Map<string, number>();
    for (const [productId, batches] of groupedMap.entries()) {
      directStockMap.set(
        productId,
        batches.reduce((sum, b) => sum + (b.amount || 0), 0),
      );
    }
    const aggregatedStockMap = buildAggregatedStockMap(this.products(), directStockMap);
    let cardItems: PantryCardItem[] = [];

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + expDays);
    const ty = target.getFullYear();
    const tm = String(target.getMonth() + 1).padStart(2, '0');
    const td = String(target.getDate()).padStart(2, '0');
    const targetStr = `${ty}-${tm}-${td}`;

    for (const [productId, batches] of groupedMap.entries()) {
      const prod = prodMap.get(productId);
      const totalAmount = batches.reduce((sum, b) => sum + (b.amount || 0), 0);

      const sortedBatches = [...batches].sort((a, b) => {
        if (!a.bestBeforeDate) return 1;
        if (!b.bestBeforeDate) return -1;
        return a.bestBeforeDate.localeCompare(b.bestBeforeDate);
      });

      const primary = sortedBatches[0];

      for (const b of batches) {
        if (!b.bestBeforeDate || b.bestBeforeDate.startsWith('2999')) {
          b.urgency = 'none';
        } else {
          const bbd = b.bestBeforeDate.slice(0, 10);
          if (bbd < todayStr) {
            b.urgency = 'expired';
          } else if (bbd <= targetStr) {
            b.urgency = 'due_soon';
          } else {
            b.urgency = 'good';
          }
        }
      }

      const hasExpired = batches.some((b) => b.urgency === 'expired');
      const hasDueSoon = batches.some((b) => b.urgency === 'due_soon');
      const overallUrgency = hasExpired ? 'expired' : hasDueSoon ? 'due_soon' : 'ok';
      const isOpen = batches.some((b) => b.isOpen);
      const openedCount = batches.filter((b) => b.isOpen).reduce((sum, b) => sum + (b.amount || 1), 0);

      const unit = prod?.quStockId ? unitMap.get(prod.quStockId) : undefined;
      const uniqueLocations = Array.from(
        new Set(
          batches
            .map((b) => b.locationName || (b.locationId ? locMap.get(b.locationId)?.name : null))
            .filter((l): l is string => !!l),
        ),
      );
      const locationIds = Array.from(
        new Set(batches.map((b) => b.locationId).filter((l): l is string => !!l)),
      );

      cardItems.push({
        id: productId,
        productId,
        productName: prod?.name || primary.productName || 'Unknown Product',
        productPictureFileName: (prod?.pictureFileNames && prod.pictureFileNames[0]) || primary.productPictureFileName,
        productGroupId: prod?.productGroupId || primary.productGroupId,
        totalAmount,
        quName: primary.quName || unit?.name || null,
        bestBeforeDate: primary.bestBeforeDate,
        urgency: overallUrgency,
        isOpen,
        openedCount,
        locationName: uniqueLocations.join(', ') || 'No location',
        locationIds,
        isOutOfStock: (aggregatedStockMap.get(productId) ?? totalAmount) <= 0,
        primaryStockItem: primary,
        batches,
      });
    }

    if (this.mode() === 'pantry') {
      for (const prod of this.products()) {
        if (prod.active === false || groupedMap.has(prod.id)) {
          continue;
        }
        if ((aggregatedStockMap.get(prod.id) ?? 0) > 0) {
          continue;
        }
        const unit = prod.quStockId ? unitMap.get(prod.quStockId) : undefined;
        const defaultLoc = prod.defaultLocationId ? locMap.get(prod.defaultLocationId) : undefined;
        cardItems.push({
          id: prod.id,
          productId: prod.id,
          productName: prod.name || 'Unknown Product',
          productPictureFileName: prod.pictureFileNames?.[0] ?? null,
          productGroupId: prod.productGroupId ?? null,
          totalAmount: 0,
          quName: unit?.name || null,
          bestBeforeDate: null,
          urgency: 'out_of_stock',
          isOpen: false,
          openedCount: 0,
          locationName: defaultLoc?.name || 'No location',
          locationIds: [],
          isOutOfStock: true,
          primaryStockItem: null,
          batches: [],
        });
      }
    }

    if (this.selectedGroupId) {
      cardItems = cardItems.filter((i) => i.productGroupId === this.selectedGroupId);
    }

    if (this.selectedLocationId) {
      cardItems = cardItems.filter((i) => i.locationIds.includes(this.selectedLocationId));
    }

    if (this.selectedStatus === 'due') {
      cardItems = cardItems.filter((i) => i.urgency === 'due_soon' || i.urgency === 'expired');
    } else if (this.selectedStatus === 'overdue') {
      cardItems = cardItems.filter((i) => i.urgency === 'expired');
    } else if (this.selectedStatus === 'open') {
      cardItems = cardItems.filter((i) => i.isOpen);
    } else if (this.selectedStatus === 'out_of_stock') {
      cardItems = cardItems.filter((i) => i.isOutOfStock);
    }

    if (query) {
      cardItems = cardItems.filter((item) => {
        const prod = prodMap.get(item.productId);
        const nameMatch = (item.productName || prod?.name || '').toLowerCase().includes(query);
        const descMatch = (prod?.description || '').toLowerCase().includes(query);
        return nameMatch || descMatch;
      });
    }

    cardItems.sort((a, b) => {
      if (this.sortBy === 'bestBeforeDate') {
        if (!!a.isOutOfStock !== !!b.isOutOfStock) {
          return a.isOutOfStock ? 1 : -1;
        }
        if (a.isOutOfStock && b.isOutOfStock) {
          return (a.productName || '').localeCompare(b.productName || '');
        }
        if (!a.bestBeforeDate) return 1;
        if (!b.bestBeforeDate) return -1;
        return a.bestBeforeDate.localeCompare(b.bestBeforeDate);
      }
      if (this.sortBy === 'name') {
        return (a.productName || '').localeCompare(b.productName || '');
      }
      if (this.sortBy === 'amount') {
        return b.totalAmount - a.totalAmount;
      }
      if (this.sortBy === 'location') {
        return (a.locationName || '').localeCompare(b.locationName || '');
      }
      return 0;
    });

    this.filteredStock.set(cardItems);

    if (this.stock().length > 0 || this.products().length > 0) {
      const totalP = Math.max(1, Math.ceil(cardItems.length / this.pageSize));
      if (this.currentPage() > totalP) {
        this.currentPage.set(totalP);
      }
    }
  }

  getUrgencyBadgeClass(urgency?: string): string {
    switch (urgency) {
      case 'expired':
        return 'badge-overdue';
      case 'due_soon':
        return 'badge-due-soon';
      default:
        return 'badge-ok';
    }
  }

  getUrgencyLabel(item: PantryCardItem | StockItem): string | null {
    if (!item.bestBeforeDate || item.bestBeforeDate.startsWith('2999')) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expParts = item.bestBeforeDate.slice(0, 10).split('-');
    const exp = new Date(Number(expParts[0]), Number(expParts[1]) - 1, Number(expParts[2]));
    const diffDays = Math.round((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Expires today';
    return `${diffDays}d left`;
  }

  hasUnopenedBatch(item: PantryCardItem): boolean {
    return item.batches.some((b) => !b.isOpen);
  }
}
