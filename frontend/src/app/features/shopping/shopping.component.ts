import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { firstValueFrom, Subscription } from 'rxjs';
import {
  LucideCheck,
  LucideFileEdit,
  LucideFileText,
  LucideGripVertical,
  LucidePackage,
  LucidePencil,
  LucidePlus,
  LucideShoppingCart,
  LucideStore,
  LucideTag,
  LucideTrash2,
  LucideZap,
} from '@lucide/angular';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { OfflineStorageService } from '../../core/offline-storage.service.js';
import { SyncService } from '../../core/sync.service.js';
import {
  MissingProduct,
  Product,
  ProductGroup,
  ShoppingList,
  ShoppingListItem,
  Store,
} from '../../core/models.js';
import { ShoppingAddModalComponent } from './shopping-add-modal/shopping-add-modal.component.js';
import { ShoppingListModalComponent } from './shopping-list-modal/shopping-list-modal.component.js';
import { ShoppingMissingModalComponent } from './shopping-missing-modal/shopping-missing-modal.component.js';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal.component.js';
import { ProductEditorModalComponent } from '../products/product-editor-modal/product-editor-modal.component.js';
import { TabItem, TabViewComponent } from '../../shared/components/tab-view/tab-view.component.js';

export interface ShoppingAisleGroup {
  name: string;
  isUnspecified: boolean;
  order: number;
  items: ShoppingListItem[];
}

@Component({
  selector: 'app-shopping',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CurrencyPipe,
    TabViewComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    LucideCheck,
    LucideFileEdit,
    LucideFileText,
    LucideGripVertical,
    LucidePackage,
    LucidePencil,
    LucidePlus,
    LucideShoppingCart,
    LucideStore,
    LucideTag,
    LucideTrash2,
    LucideZap,
  ],
  templateUrl: './shopping.component.html',
  styleUrl: './shopping.component.scss',
})
export class ShoppingComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly storage = inject(OfflineStorageService);
  private readonly syncService = inject(SyncService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private queryParamSub?: Subscription;
  private lastLoadedHouseholdId: string | null = null;

  readonly shoppingLists = signal<ShoppingList[]>([]);
  readonly selectedListId = signal<string>('');
  readonly items = signal<ShoppingListItem[]>([]);
  readonly products = signal<Product[]>([]);
  readonly productGroups = signal<ProductGroup[]>([]);
  readonly stores = signal<Store[]>([]);
  readonly missingProducts = signal<MissingProduct[]>([]);
  readonly isLoading = signal<boolean>(true);

  readonly shoppingListTabs = computed<TabItem[]>(() => {
    return this.shoppingLists().map((l) => ({
      id: l.id,
      label: l.name + (l.isDefault ? ' ★' : ''),
      icon: l.storeId ? '🏬' : '🛒',
      lucideIcon: l.storeId ? 'store' : 'shopping-cart',
    }));
  });

  readonly aisleGroups = computed<ShoppingAisleGroup[]>(() => {
    const allItems = this.items();
    if (!allItems.length) return [];

    const groupMap = new Map<string, { isUnspecified: boolean; order: number; items: ShoppingListItem[] }>();

    for (const item of allItems) {
      const aisleName = item.aisle?.trim();
      if (aisleName) {
        if (!groupMap.has(aisleName)) {
          groupMap.set(aisleName, {
            isUnspecified: false,
            order: item.aisleOrder ?? 9999,
            items: [],
          });
        }
        groupMap.get(aisleName)!.items.push(item);
      } else {
        const key = '__unspecified__';
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            isUnspecified: true,
            order: 999999,
            items: [],
          });
        }
        groupMap.get(key)!.items.push(item);
      }
    }

    const groups: ShoppingAisleGroup[] = [];
    const hasStore = !!this.currentList()?.storeId;
    for (const [key, val] of groupMap.entries()) {
      groups.push({
        name: key === '__unspecified__' ? (hasStore ? 'Unspecified Aisle' : 'Items') : key,
        isUnspecified: val.isUnspecified,
        order: val.order,
        items: val.items,
      });
    }

    // Sort aisle groups by their aisle order, then alphabetically, with unspecified group always at the bottom
    groups.sort((a, b) => {
      if (a.isUnspecified !== b.isUnspecified) {
        return a.isUnspecified ? 1 : -1;
      }
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.name.localeCompare(b.name);
    });

    return groups;
  });

  selectedStoreId = '';
  newItemName = '';
  newItemAmount = 1;

  get currentList(): () => ShoppingList | undefined {
    return () => this.shoppingLists().find((l) => l.id === this.selectedListId());
  }

  get pendingItemsCount(): () => number {
    return () => this.items().filter((i) => !i.done).length;
  }

  get doneItemsCount(): () => number {
    return () => this.items().filter((i) => i.done).length;
  }

  get missingProductsCount(): () => number {
    return () => this.missingProducts().length;
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

  ngOnInit(): void {
    const hhId = this.auth.activeHouseholdId();
    if (hhId && hhId !== this.lastLoadedHouseholdId) {
      this.lastLoadedHouseholdId = hhId;
      this.loadData();
    }

    // Listen to queryparam changes (browser back, forward, refresh)
    this.queryParamSub = this.route.queryParamMap.subscribe((params) => {
      const qListId = params.get('list');
      if (qListId && qListId !== this.selectedListId()) {
        if (this.shoppingLists().some((l) => l.id === qListId)) {
          this.selectList(qListId, false);
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.queryParamSub?.unsubscribe();
  }

  async loadData(): Promise<void> {
    this.isLoading.set(true);
    const hhId = this.auth.activeHouseholdId();
    try {
      let lists: ShoppingList[] = [];
      try {
        lists = await this.api.getShoppingLists();
        if (hhId) {
          await this.storage.setMeta(`shopping_lists_${hhId}`, lists);
        }
      } catch (err) {
        console.warn('Could not fetch shopping lists online, fallback to local storage', err);
        if (hhId) {
          const cached = await this.storage.getMeta(`shopping_lists_${hhId}`);
          if (Array.isArray(cached) && cached.length > 0) {
            lists = cached;
          }
        }
      }

      // Respect locally cached custom drag & drop list order if present
      if (hhId && lists.length > 0) {
        const localOrderJson = localStorage.getItem(`cambusa_lists_order_${hhId}`);
        if (localOrderJson) {
          try {
            const localOrder: string[] = JSON.parse(localOrderJson);
            if (Array.isArray(localOrder) && localOrder.length > 0) {
              const orderMap = new Map(localOrder.map((id, idx) => [id, idx]));
              lists.sort((a, b) => {
                const ordA = orderMap.has(a.id) ? orderMap.get(a.id)! : (a.sortOrder ?? 9999);
                const ordB = orderMap.has(b.id) ? orderMap.get(b.id)! : (b.sortOrder ?? 9999);
                return ordA - ordB;
              });
            }
          } catch {
            // ignore malformed localStorage
          }
        }
      }

      const [prods, stores, missing, pGroups] = await Promise.all([
        this.api.getProducts().catch(() => []),
        this.api.getStores().catch(() => []),
        this.api.getMissingProducts().catch(() => []),
        (typeof this.api.getProductGroups === 'function'
          ? this.api.getProductGroups()
          : typeof (this.api as any).getGroups === 'function'
            ? (this.api as any).getGroups()
            : Promise.resolve([])
        ).catch(() => []),
      ]);

      this.shoppingLists.set(lists);
      this.products.set(prods);
      this.productGroups.set(pGroups);
      this.stores.set(stores);
      this.missingProducts.set(missing);

      if (lists.length > 0) {
        const qListId = this.route.snapshot.queryParamMap.get('list');
        const targetList =
          (qListId && lists.find((l) => l.id === qListId)) ||
          lists.find((l) => l.isDefault) ||
          lists.find((l) => l.id === this.selectedListId()) ||
          lists[0];

        this.selectedListId.set(targetList.id);
        this.selectedStoreId = targetList.storeId || '';
        this.syncUrlQueryParam(targetList.id);
      }

      await this.loadItems();
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadItems(): Promise<void> {
    const listId = this.selectedListId() || undefined;
    const storeId = this.selectedStoreId || undefined;
    const items = await this.api.getShoppingItems(listId, storeId);
    this.items.set(items);
  }

  selectList(listId: string, updateUrl = true): void {
    this.selectedListId.set(listId);
    const chosen = this.shoppingLists().find((l) => l.id === listId);
    this.selectedStoreId = chosen?.storeId || '';
    if (updateUrl) {
      this.syncUrlQueryParam(listId);
    }
    this.loadItems();
  }

  private syncUrlQueryParam(listId: string): void {
    const currentQ = this.route.snapshot.queryParamMap.get('list');
    if (currentQ !== listId) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { list: listId },
        queryParamsHandling: 'merge',
        replaceUrl: false,
      });
    }
  }

  async onShoppingListsReordered(tabs: TabItem[]): Promise<void> {
    const listMap = new Map(this.shoppingLists().map((l) => [l.id, l]));
    const reorderedLists = tabs.map((t) => listMap.get(t.id)).filter(Boolean) as ShoppingList[];
    reorderedLists.forEach((l, idx) => (l.sortOrder = idx));
    this.shoppingLists.set(reorderedLists);

    const hhId = this.auth.activeHouseholdId();
    const listIds = reorderedLists.map((l) => l.id);

    // 1. Save locally first (offline-first)
    if (hhId) {
      try {
        localStorage.setItem(`cambusa_lists_order_${hhId}`, JSON.stringify(listIds));
        await this.storage.setMeta(`shopping_lists_${hhId}`, reorderedLists);
      } catch (err) {
        console.warn('Error saving shopping lists order locally', err);
      }
    }

    // 2. Queue for background sync
    await this.storage.enqueue({
      entity: 'shopping_list',
      action: 'update',
      payload: reorderedLists.map((l, idx) => ({ id: l.id, sortOrder: idx })),
    });

    // 3. Post to backend and trigger sync
    try {
      await this.api.reorderShoppingLists(listIds);
      await this.syncService.sync();
    } catch (err) {
      console.warn('Offline: shopping lists reorder queued for subsequent sync', err);
    }
  }

  async onItemDrop(event: CdkDragDrop<ShoppingListItem[]>, group: ShoppingAisleGroup): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;

    const groupItems = [...group.items];
    moveItemInArray(groupItems, event.previousIndex, event.currentIndex);

    // Update items signal preserving the new order
    const groupItemIds = new Set(groupItems.map((i) => i.id));
    const otherItems = this.items().filter((i) => !groupItemIds.has(i.id));
    this.items.set([...otherItems, ...groupItems]);

    // Persist reordered items to backend
    try {
      await this.api.reorderShoppingItems(groupItems.map((i) => i.id));
    } catch {
      // Ignored
    }
  }

  getStoreName(storeId: string): string {
    return this.stores().find((s) => s.id === storeId)?.name ?? 'Store';
  }

  getProductGroupName(productId: string | null): string | null {
    if (!productId) return null;
    const prod = this.products().find((p) => p.id === productId);
    if (!prod || !prod.productGroupId) return null;
    const group = this.productGroups().find((g) => g.id === prod.productGroupId);
    return group ? group.name : null;
  }

  openCreateListModal(): void {
    const dialogRef = this.dialog.open(ShoppingListModalComponent, {
      data: {
        shoppingList: null,
        stores: this.stores(),
      },
    });

    firstValueFrom(dialogRef.closed).then((created) => {
      if (created) {
        this.loadData();
      }
    });
  }

  openEditListModal(): void {
    const curr = this.currentList();
    if (!curr) return;

    const dialogRef = this.dialog.open(ShoppingListModalComponent, {
      data: {
        shoppingList: curr,
        stores: this.stores(),
      },
    });

    firstValueFrom(dialogRef.closed).then((saved) => {
      if (saved) {
        this.loadData();
      }
    });
  }

  async confirmDeleteList(): Promise<void> {
    const curr = this.currentList();
    if (!curr) return;

    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Delete Shopping List',
        message: `Are you sure you want to delete the list "${curr.name}" and all its items?`,
        confirmLabel: 'Delete List',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (confirmed) {
      await this.api.deleteShoppingList(curr.id);
      this.selectedListId.set('');
      await this.loadData();
    }
  }

  openAddItemModal(): void {
    const curr = this.currentList();
    const dialogRef = this.dialog.open(ShoppingAddModalComponent, {
      disableClose: true,
      data: {
        products: this.products(),
        stores: this.stores(),
        shoppingListId: curr?.id,
        defaultStoreId: curr?.storeId || this.selectedStoreId || null,
      },
    });

    firstValueFrom(dialogRef.closed).then((added) => {
      if (added) {
        this.loadItems();
      }
    });
  }

  openEditItemModal(item: ShoppingListItem): void {
    const curr = this.currentList();
    const dialogRef = this.dialog.open(ShoppingAddModalComponent, {
      disableClose: true,
      data: {
        products: this.products(),
        stores: this.stores(),
        shoppingListId: curr?.id,
        defaultStoreId: curr?.storeId || this.selectedStoreId || null,
        itemToEdit: item,
      },
    });

    firstValueFrom(dialogRef.closed).then((updated) => {
      if (updated) {
        this.loadItems();
      }
    });
  }

  async openEditProductModal(productId: string): Promise<void> {
    let product = this.products().find((p) => p.id === productId);
    try {
      if (!product) {
        product = await this.api.getProduct(productId);
      }
      if (!product) return;

      const [locations, units, stores, allProducts, productGroups] = await Promise.all([
        this.api.getLocations(),
        this.api.getUnits(),
        this.api.getStores(),
        this.api.getProducts(),
        this.api.getGroups(),
      ]);

      const dialogRef = this.dialog.open(ProductEditorModalComponent, {
        disableClose: true,
        data: {
          product,
          allProducts,
          productGroups,
          locations,
          units,
          stores,
        },
      });

      const res = await firstValueFrom(dialogRef.closed);
      if (res) {
        await this.loadData();
      }
    } catch (err) {
      console.error('Failed to open product editor from shopping list:', err);
    }
  }

  openMissingModal(): void {
    const curr = this.currentList();
    const dialogRef = this.dialog.open(ShoppingMissingModalComponent, {
      data: {
        shoppingListId: curr?.id,
        missingProducts: this.missingProducts(),
      },
    });

    firstValueFrom(dialogRef.closed).then((added) => {
      if (added) {
        this.loadData();
      }
    });
  }

  async quickAddItem(): Promise<void> {
    if (!this.newItemName.trim()) return;

    await this.api.addShoppingItem({
      shoppingListId: this.selectedListId() || undefined,
      customName: this.newItemName.trim(),
      amount: this.newItemAmount || 1,
      storeId: this.selectedStoreId || null,
    });

    this.newItemName = '';
    this.newItemAmount = 1;
    await this.loadItems();
  }

  async toggleDone(id: string): Promise<void> {
    this.items.update((list) =>
      list.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    );

    await this.api.toggleShoppingItemDone(id);
  }

  async deleteItem(item: ShoppingListItem): Promise<void> {
    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Delete Shopping Item',
        message: `Are you sure you want to remove "${item.productName}" from the shopping list?`,
        confirmLabel: 'Delete',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (confirmed) {
      await this.api.deleteShoppingItem(item.id);
      this.items.update((list) => list.filter((i) => i.id !== item.id));
    }
  }

  async clearDoneItems(): Promise<void> {
    await this.api.clearDoneShoppingItems(this.selectedListId() || undefined);
    await this.loadItems();
  }
}
