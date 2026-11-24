import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { UndoService } from '../../core/undo.service.js';
import { calculateProductTotalStock } from '../../core/stock-utils.js';
import {
  LucideLockOpen,
  LucideMapPin,
  LucidePackage,
  LucidePlus,
  LucideSave,
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
  Store,
} from '../../core/models.js';
import { PantryActionModalComponent } from './pantry-action-modal/pantry-action-modal.component.js';
import { PantryAddItemModalComponent } from './pantry-add-item-modal/pantry-add-item-modal.component.js';
import { StockItemEditorModalComponent } from './stock-item-editor-modal/stock-item-editor-modal.component.js';
import { QuickDateModifierComponent } from '../../shared/components/quick-date-modifier/quick-date-modifier.component.js';
import { QuickActionsFooterComponent } from '../../shared/components/quick-actions-footer/quick-actions-footer.component.js';

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
  primaryStockItem: StockItem;
  batches: StockItem[];
}

@Component({
  selector: 'app-pantry',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    QuickDateModifierComponent,
    QuickActionsFooterComponent,
    LucideLockOpen,
    LucideMapPin,
    LucidePackage,
    LucidePlus,
    LucideSave,
    LucideX,
    LucideZap,
  ],
  templateUrl: './pantry.component.html',
  styleUrl: './pantry.component.scss',
})
export class PantryComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly undoService = inject(UndoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly stock = signal<StockItem[]>([]);
  readonly filteredStock = signal<PantryCardItem[]>([]);
  readonly products = signal<Product[]>([]);
  readonly locations = signal<Location[]>([]);
  readonly productGroups = signal<ProductGroup[]>([]);
  readonly stores = signal<Store[]>([]);
  readonly units = signal<QuantityUnit[]>([]);
  readonly savedFilters = signal<SavedFilter[]>([]);
  readonly isLoading = signal<boolean>(true);

  // Filters state
  selectedGroupId = '';
  selectedLocationId = '';
  selectedStatus = 'all';
  sortBy = 'bestBeforeDate';
  readonly searchQuery = signal<string>('');
  readonly expiringSoonDays = signal<number>(5);
  readonly hasActiveFilters = signal<boolean>(false);

  // Pagination state
  readonly currentPage = signal<number>(1);
  readonly pageSize = 24;

  readonly totalItems = computed(() => this.filteredStock().length);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize)));
  readonly paginatedStock = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredStock().slice(start, start + this.pageSize);
  });

  // Save filter modal state
  readonly isSaveFilterModalOpen = signal<boolean>(false);
  newFilterName = '';

  private subs = new Subscription();
  private lastLoadedHouseholdId: string | null = null;

  constructor() {
    effect(() => {
      const hhId = this.auth.activeHouseholdId();
      if (hhId && hhId !== this.lastLoadedHouseholdId) {
        this.lastLoadedHouseholdId = hhId;
        untracked(() => this.loadData());
      }
    });
  }

  ngOnInit() {
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

        if (this.stock().length > 0) {
          this.applyLocalFilters();
        }
      }),
    );

    const hhId = this.auth.activeHouseholdId();
    if (hhId && hhId !== this.lastLoadedHouseholdId) {
      this.lastLoadedHouseholdId = hhId;
      this.loadData();
    }
  }

  ngOnDestroy() {
    this.cancelSearchDebounce();
    this.subs.unsubscribe();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const [items, prods, locs, groups, stores, units, filters, profile] = await Promise.all([
        this.api.getStock(),
        this.api.getProducts(true),
        this.api.getLocations(),
        this.api.getGroups(),
        this.api.getStores(),
        this.api.getUnits(),
        this.api.getSavedFilters(),
        this.api.getProfile().catch(() => null),
      ]);

      if (profile?.settings?.nextExpiringDays) {
        this.expiringSoonDays.set(profile.settings.nextExpiringDays);
      }

      this.stock.set(items);
      this.products.set(prods);
      this.locations.set(locs);
      this.productGroups.set(groups);
      this.stores.set(stores);
      this.units.set(units);
      this.savedFilters.set(filters);

      this.applyLocalFilters();
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadStock() {
    const items = await this.api.getStock(this.expiringSoonDays());
    this.stock.set(items);
    this.applyLocalFilters();
  }

  clearAllFilters() {
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

  onFilterChange() {
    this.cancelSearchDebounce();
    this.currentPage.set(1);
    this.syncQueryParams();
    this.applyLocalFilters();
  }

  onSearchChange(val: string) {
    this.searchQuery.set(val);
    this.currentPage.set(1);
    this.applyLocalFilters();
    this.debounceSyncQueryParams(1000);
  }

  clearSearch() {
    this.cancelSearchDebounce();
    this.searchQuery.set('');
    this.currentPage.set(1);
    this.syncQueryParams();
    this.applyLocalFilters();
  }

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages()) return;
    this.cancelSearchDebounce();
    this.currentPage.set(p);
    this.syncQueryParams();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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

  syncQueryParams() {
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

  getTotalProductStock(productId: string): number {
    return calculateProductTotalStock(productId, this.stock());
  }

  applyLocalFilters() {
    const allStock = this.stock();
    const query = this.searchQuery().trim().toLowerCase();
    const expDays = this.expiringSoonDays();

    this.hasActiveFilters.set(
      this.searchQuery().trim().length > 0 ||
      this.selectedGroupId !== '' ||
      this.selectedLocationId !== '' ||
      this.selectedStatus !== 'all' ||
      this.sortBy !== 'bestBeforeDate'
    );

    // 1. Group stock items by productId so each product has exactly one card in pantry
    const groupedMap = new Map<string, StockItem[]>();
    for (const item of allStock) {
      const list = groupedMap.get(item.productId) || [];
      list.push(item);
      groupedMap.set(item.productId, list);
    }

    const prodMap = new Map(this.products().map((p) => [p.id, p]));
    const unitMap = new Map(this.units().map((u) => [u.id, u]));
    const locMap = new Map(this.locations().map((l) => [l.id, l]));
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

      // Sort batches by expiration date (earliest first, nulls last)
      const sortedBatches = [...batches].sort((a, b) => {
        if (!a.bestBeforeDate) return 1;
        if (!b.bestBeforeDate) return -1;
        return a.bestBeforeDate.localeCompare(b.bestBeforeDate);
      });

      const primary = sortedBatches[0];

      // Update urgency on each batch according to user's Next expiration horizon
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
        primaryStockItem: primary,
        batches,
      });
    }

    // 2. Filter by Category
    if (this.selectedGroupId) {
      cardItems = cardItems.filter((i) => i.productGroupId === this.selectedGroupId);
    }

    // 3. Filter by Location
    if (this.selectedLocationId) {
      cardItems = cardItems.filter((i) => i.locationIds.includes(this.selectedLocationId));
    }

    // 4. Filter by Status
    if (this.selectedStatus === 'due') {
      cardItems = cardItems.filter((i) => i.urgency === 'due_soon' || i.urgency === 'expired');
    } else if (this.selectedStatus === 'overdue') {
      cardItems = cardItems.filter((i) => i.urgency === 'expired');
    } else if (this.selectedStatus === 'open') {
      cardItems = cardItems.filter((i) => i.isOpen);
    }

    // 5. Filter by free-text search (matches productName or description)
    if (query) {
      cardItems = cardItems.filter((item) => {
        const prod = prodMap.get(item.productId);
        const nameMatch = (item.productName || prod?.name || '').toLowerCase().includes(query);
        const descMatch = (prod?.description || '').toLowerCase().includes(query);
        return nameMatch || descMatch;
      });
    }

    // 6. Sort
    cardItems.sort((a, b) => {
      if (this.sortBy === 'bestBeforeDate') {
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

    if (this.stock().length > 0) {
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

  getUrgencyLabel(item: PantryCardItem | StockItem): string|null {
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

  private resolveItemDisplay(item: PantryCardItem | StockItem, batch?: StockItem): { productName: string; quName: string | null } {
    const productId = batch?.productId || item.productId;
    const prod = productId ? this.products().find((p) => p.id === productId) : undefined;
    const unit = prod?.quStockId ? this.units().find((u) => u.id === prod.quStockId) : undefined;
    const cardProductName = 'productName' in item ? item.productName : undefined;
    const cardQuName = 'quName' in item ? item.quName : undefined;

    return {
      productName: prod?.name || batch?.productName || cardProductName || 'Item',
      quName: batch?.quName || cardQuName || unit?.name || null,
    };
  }

  async adjustStockDate(item: PantryCardItem | StockItem, newDate: string | null) {
    const targetItem = 'primaryStockItem' in item ? item.primaryStockItem : item;
    const previousDate = targetItem.bestBeforeDate;
    await this.api.adjustDate(targetItem.id, { explicitDate: newDate || undefined });
    targetItem.bestBeforeDate = newDate;
    this.applyLocalFilters();

    const { productName } = this.resolveItemDisplay(item, targetItem);
    this.undoService.register({
      description: `Changed expiry of ${productName} to ${newDate || 'Never'}`,
      onUndo: async () => {
        await this.api.adjustDate(targetItem.id, { explicitDate: previousDate || undefined });
        targetItem.bestBeforeDate = previousDate;
        this.applyLocalFilters();
      },
    });
  }

  hasUnopenedBatch(item: PantryCardItem | StockItem): boolean {
    if ('batches' in item && item.batches) {
      return item.batches.some((b) => !b.isOpen);
    }
    return !item.isOpen;
  }

  async openOne(item: PantryCardItem | StockItem) {
    let targetBatch: StockItem | undefined;

    if ('batches' in item && item.batches) {
      const unopened = item.batches
        .filter((b) => !b.isOpen)
        .sort((a, b) => {
          if (!a.bestBeforeDate) return 1;
          if (!b.bestBeforeDate) return -1;
          return a.bestBeforeDate.localeCompare(b.bestBeforeDate);
        });
      targetBatch = unopened[0];
    } else {
      targetBatch = 'primaryStockItem' in item ? item.primaryStockItem : item;
    }

    if (!targetBatch) return;

    const result = await this.api.openStock(targetBatch.id, 1);
    await this.loadStock();

    const { productName, quName } = this.resolveItemDisplay(item, targetBatch);
    this.undoService.register({
      description: `Opened 1 ${quName || 'unit'} of ${productName}`,
      onUndo: async () => {
        await this.api.revertOpen({
          openedStockItemId: result.openedStockItem.id,
          originalStockItemId: result.originalStockItem ? result.originalStockItem.id : targetBatch.id,
          split: result.split,
          amount: 1,
          originalDate: result.originalDate,
          originalLocationId: result.originalLocationId,
        });
        await this.loadStock();
      },
    });
  }

  async consume(item: PantryCardItem | StockItem, amount: number) {
    const targetItem = 'primaryStockItem' in item ? item.primaryStockItem : item;
    await this.api.consumeStock(targetItem.id, amount);
    await this.loadStock();

    const { productName, quName } = this.resolveItemDisplay(item, targetItem);
    this.undoService.register({
      description: `Consumed ${amount} ${quName || 'units'} of ${productName}`,
      onUndo: async () => {
        await this.api.addStock({
          productId: targetItem.productId,
          amount,
          locationId: targetItem.locationId,
          bestBeforeDate: targetItem.bestBeforeDate,
        });
        await this.loadStock();
      },
    });
  }

  async openProductActionModal(item: PantryCardItem | StockItem) {
    const productId = 'productId' in item ? item.productId : (item as any).productId;
    let prod = this.products().find((p) => p.id === productId);
    if (!prod) {
      try {
        prod = await this.api.getProduct(productId);
        if (prod) {
          this.products.set([...this.products(), prod]);
        }
      } catch (err) {
        console.error('Failed to load product details for action modal:', err);
      }
    }
    if (!prod) return;

    const dialogRef = this.dialog.open(PantryActionModalComponent, {
      disableClose: true,
      data: {
        product: prod,
        stockItems: this.stock(),
        locations: this.locations(),
        stores: this.stores(),
        units: this.units(),
        allProducts: this.products(),
        productGroups: this.productGroups(),
      },
    });

    firstValueFrom(dialogRef.closed).then((res: any) => {
      if (res && res.updatedProduct) {
        const up = res.updatedProduct;
        this.products.set(this.products().map((p) => (p.id === up.id ? up : p)));
      }
      if (res && res.refreshed) {
        this.loadStock();
      }
    });
  }

  openAddStockModal() {
    const dialogRef = this.dialog.open(PantryAddItemModalComponent, {
      disableClose: true,
      data: {
        products: this.products(),
        locations: this.locations(),
        stores: this.stores(),
        units: this.units(),
        productGroups: this.productGroups(),
      },
    });

    firstValueFrom(dialogRef.closed).then((res: any) => {
      if (res && res.refreshed) {
        this.loadStock();
      }
    });
  }

  openEditStockItem(item: StockItem) {
    const dialogRef = this.dialog.open(StockItemEditorModalComponent, {
      disableClose: true,
      data: {
        stockItem: item,
        locations: this.locations(),
        product: this.products().find((p) => p.id === item.productId),
      },
    });

    firstValueFrom(dialogRef.closed).then((res: any) => {
      if (res && res.updated) {
        this.loadStock();
      }
    });
  }

  openSaveFilterModal() {
    this.newFilterName = '';
    this.isSaveFilterModalOpen.set(true);
  }

  closeSaveFilterModal() {
    this.isSaveFilterModalOpen.set(false);
  }

  async saveCurrentFilter() {
    if (!this.newFilterName.trim()) return;

    const config: FilterConfig = {
      productGroupIds: this.selectedGroupId ? [this.selectedGroupId] : undefined,
      locationIds: this.selectedLocationId ? [this.selectedLocationId] : undefined,
      status: this.selectedStatus as any,
      sortBy: this.sortBy as any,
    };

    const saved = await this.api.saveFilter(this.newFilterName.trim(), config);
    this.savedFilters.set([...this.savedFilters(), saved]);
    this.closeSaveFilterModal();
  }

  applySavedFilter(sf: SavedFilter) {
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

  async deleteSavedFilter(id: string) {
    await this.api.deleteSavedFilter(id);
    this.savedFilters.set(this.savedFilters().filter((f) => f.id !== id));
  }
}
