import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal, untracked, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { compareByName } from '../../core/sorting.utils.js';
import { UndoService } from '../../core/undo.service.js';
import { calculateProductTotalStock } from '../../core/stock-utils.js';
import {
  LucidePlus,
  LucideSave,
  LucideX,
} from '@lucide/angular';
import {
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
import { QuickActionsFooterComponent } from '../../shared/components/quick-actions-footer/quick-actions-footer.component.js';
import {
  PantryCardItem,
  PantryInventoryGridComponent,
} from '../../shared/components/pantry-inventory-grid/pantry-inventory-grid.component.js';

export type { PantryCardItem };

@Component({
  selector: 'app-pantry',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PantryInventoryGridComponent,
    QuickActionsFooterComponent,
    LucidePlus,
    LucideSave,
    LucideX,
  ],
  templateUrl: './pantry.component.html',
  styleUrl: './pantry.component.scss',
})
export class PantryComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly undoService = inject(UndoService);

  @ViewChild(PantryInventoryGridComponent) grid?: PantryInventoryGridComponent;

  readonly stock = signal<StockItem[]>([]);
  readonly products = signal<Product[]>([]);
  readonly locations = signal<Location[]>([]);
  readonly productGroups = signal<ProductGroup[]>([]);
  readonly stores = signal<Store[]>([]);
  readonly units = signal<QuantityUnit[]>([]);
  readonly savedFilters = signal<SavedFilter[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly expiringSoonDays = signal<number>(5);

  // Save filter modal state
  readonly isSaveFilterModalOpen = signal<boolean>(false);
  newFilterName = '';

  private lastLoadedHouseholdId: string | null = null;

  // Delegated getters/setters for seamless integration & test compatibility
  get searchQuery() {
    return this.grid ? this.grid.searchQuery : signal('');
  }
  get currentPage() {
    return this.grid ? this.grid.currentPage : signal(1);
  }
  get filteredStock() {
    return this.grid ? this.grid.filteredStock : signal<PantryCardItem[]>([]);
  }
  get hasActiveFilters() {
    return this.grid ? this.grid.hasActiveFilters : signal(false);
  }
  readonly totalItems = computed(() => this.grid?.totalItems() ?? 0);
  readonly paginatedStock = computed(() => this.grid?.paginatedStock() ?? []);

  get selectedGroupId(): string {
    return this.grid?.selectedGroupId ?? '';
  }
  set selectedGroupId(v: string) {
    if (this.grid) this.grid.selectedGroupId = v;
  }
  get selectedLocationId(): string {
    return this.grid?.selectedLocationId ?? '';
  }
  set selectedLocationId(v: string) {
    if (this.grid) this.grid.selectedLocationId = v;
  }
  get selectedStatus(): string {
    return this.grid?.selectedStatus ?? 'all';
  }
  set selectedStatus(v: string) {
    if (this.grid) this.grid.selectedStatus = v;
  }
  get sortBy(): string {
    return this.grid?.sortBy ?? 'bestBeforeDate';
  }
  set sortBy(v: string) {
    if (this.grid) this.grid.sortBy = v;
  }

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
    const hhId = this.auth.activeHouseholdId();
    if (hhId && hhId !== this.lastLoadedHouseholdId) {
      this.lastLoadedHouseholdId = hhId;
      this.loadData();
    }
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
      this.locations.set([...locs].sort(compareByName));
      this.productGroups.set([...groups].sort(compareByName));
      this.stores.set([...stores].sort(compareByName));
      this.units.set([...units].sort(compareByName));
      this.savedFilters.set(filters);

      this.grid?.applyLocalFilters();
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadStock() {
    const items = await this.api.getStock(this.expiringSoonDays());
    this.stock.set(items);
    this.grid?.applyLocalFilters();
  }

  applyLocalFilters() {
    this.grid?.applyLocalFilters();
  }

  onSearchChange(val: string) {
    this.grid?.onSearchChange(val);
  }

  clearSearch() {
    this.grid?.clearSearch();
  }

  clearAllFilters() {
    this.grid?.clearAllFilters();
  }

  getTotalProductStock(productId: string): number {
    return calculateProductTotalStock(productId, this.stock());
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
    if (!targetItem) return;
    const previousDate = targetItem.bestBeforeDate;
    await this.api.adjustDate(targetItem.id, { explicitDate: newDate || undefined });
    targetItem.bestBeforeDate = newDate;
    this.grid?.applyLocalFilters();

    const { productName } = this.resolveItemDisplay(item, targetItem);
    this.undoService.register({
      description: `Changed expiry of ${productName} to ${newDate || 'Never'}`,
      onUndo: async () => {
        await this.api.adjustDate(targetItem.id, { explicitDate: previousDate || undefined });
        targetItem.bestBeforeDate = previousDate;
        this.grid?.applyLocalFilters();
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
      targetBatch = 'primaryStockItem' in item ? (item.primaryStockItem ?? undefined) : item;
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
    if (!targetItem) return;
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

    const config = this.grid?.getFilterConfig() ?? {};
    const saved = await this.api.saveFilter(this.newFilterName.trim(), config);
    this.savedFilters.set([...this.savedFilters(), saved]);
    this.closeSaveFilterModal();
  }

  async deleteSavedFilter(id: string) {
    await this.api.deleteSavedFilter(id);
    this.savedFilters.set(this.savedFilters().filter((f) => f.id !== id));
  }
}
