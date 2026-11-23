import { CommonModule } from '@angular/common';
import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import {
  MissingProduct,
  Product,
  ShoppingList,
  ShoppingListItem,
  Store,
} from '../../core/models.js';
import { ShoppingAddModalComponent } from './shopping-add-modal/shopping-add-modal.component.js';
import { ShoppingListModalComponent } from './shopping-list-modal/shopping-list-modal.component.js';
import { ShoppingMissingModalComponent } from './shopping-missing-modal/shopping-missing-modal.component.js';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal.component.js';

@Component({
  selector: 'app-shopping',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shopping.component.html',
  styleUrl: './shopping.component.scss',
})
export class ShoppingComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);

  readonly shoppingLists = signal<ShoppingList[]>([]);
  readonly selectedListId = signal<string>('');
  readonly items = signal<ShoppingListItem[]>([]);
  readonly products = signal<Product[]>([]);
  readonly stores = signal<Store[]>([]);
  readonly missingProducts = signal<MissingProduct[]>([]);
  readonly isLoading = signal<boolean>(true);

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
      if (hhId) {
        this.loadData();
      }
    });
  }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const [lists, prods, stores, missing] = await Promise.all([
        this.api.getShoppingLists(),
        this.api.getProducts(),
        this.api.getStores(),
        this.api.getMissingProducts(),
      ]);

      this.shoppingLists.set(lists);
      this.products.set(prods);
      this.stores.set(stores);
      this.missingProducts.set(missing);

      if (lists.length > 0) {
        if (!this.selectedListId() || !lists.some((l) => l.id === this.selectedListId())) {
          const def = lists.find((l) => l.isDefault) || lists[0];
          this.selectedListId.set(def.id);
          if (def.storeId) {
            this.selectedStoreId = def.storeId;
          }
        }
      }

      await this.loadItems();
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadItems() {
    const listId = this.selectedListId() || undefined;
    const storeId = this.selectedStoreId || undefined;
    const items = await this.api.getShoppingItems(listId, storeId);
    this.items.set(items);
  }

  selectList(listId: string) {
    this.selectedListId.set(listId);
    const chosen = this.shoppingLists().find((l) => l.id === listId);
    if (chosen && chosen.storeId) {
      this.selectedStoreId = chosen.storeId;
    }
    this.loadItems();
  }

  getStoreName(storeId: string): string {
    return this.stores().find((s) => s.id === storeId)?.name ?? 'Store';
  }

  openCreateListModal() {
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

  openEditListModal() {
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

  async confirmDeleteList() {
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

  openAddItemModal() {
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

  openEditItemModal(item: ShoppingListItem) {
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

  openMissingModal() {
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

  async quickAddItem() {
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

  async toggleDone(id: string) {
    this.items.update((list) =>
      list.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    );

    await this.api.toggleShoppingItemDone(id);
  }

  async deleteItem(id: string) {
    await this.api.deleteShoppingItem(id);
    this.items.update((list) => list.filter((i) => i.id !== id));
  }

  async clearDoneItems() {
    await this.api.clearDoneShoppingItems(this.selectedListId() || undefined);
    await this.loadItems();
  }
}
