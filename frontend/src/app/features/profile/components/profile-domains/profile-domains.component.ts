import { CommonModule } from '@angular/common';
import { Component, effect, inject, OnInit, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ApiService } from '../../../../core/api.service.js';
import { AuthService } from '../../../../core/auth.service.js';
import { compareByName, compareByNumericOrder } from '../../../../core/sorting.utils.js';
import { SyncService } from '../../../../core/sync.service.js';
import { Aisle, Store } from '../../../../core/models.js';
import { TabItem, TabViewComponent } from '../../../../shared/components/tab-view/tab-view.component.js';
import {
  LucideGripVertical,
  LucidePencil,
  LucideShoppingCart,
  LucideStore,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component.js';

export type DomainTab = 'stores' | 'aisles';

@Component({
  selector: 'app-profile-domains',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TabViewComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    LucideGripVertical,
    LucidePencil,
    LucideShoppingCart,
    LucideStore,
    LucideTrash2,
    LucideX,
  ],
  templateUrl: './profile-domains.component.html',
  styleUrl: './profile-domains.component.scss',
})
export class ProfileDomainsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService, { optional: true });
  private readonly syncService = inject(SyncService, { optional: true });
  private readonly dialog = inject(Dialog);

  private lastLoadedHouseholdId: string | null = null;
  private lastSyncCount = 0;

  readonly activeDomainTab = signal<DomainTab>('stores');

  readonly domainTabs: TabItem<DomainTab>[] = [
    { id: 'stores', label: 'Stores', lucideIcon: 'store' },
    { id: 'aisles', label: 'Aisles', lucideIcon: 'shopping-cart' },
  ];

  // Stores state
  readonly stores = signal<Store[]>([]);
  readonly isStoreModalOpen = signal<boolean>(false);
  readonly editingStoreId = signal<string | null>(null);
  readonly storeName = signal<string>('');
  readonly storeDescription = signal<string>('');

  // Aisles state
  readonly selectedAisleStoreId = signal<string>('');
  readonly currentStoreAisles = signal<Aisle[]>([]);
  readonly isLoadingAisles = signal<boolean>(false);
  readonly newAisleName = signal<string>('');
  readonly editingAisleId = signal<string | null>(null);
  readonly editingAisleName = signal<string>('');

  readonly toast = output<{ type: 'success' | 'error'; message: string }>();

  constructor() {
    effect(() => {
      const hhId = this.auth?.activeHouseholdId() ?? null;
      if (hhId && hhId !== this.lastLoadedHouseholdId) {
        this.lastLoadedHouseholdId = hhId;
        untracked(() => this.loadStores());
      }
    });

    effect(() => {
      const syncCount = this.syncService?.onSyncCompleted() ?? 0;
      if (syncCount > 0 && syncCount !== this.lastSyncCount) {
        this.lastSyncCount = syncCount;
        untracked(() => this.loadStores());
      }
    });
  }

  ngOnInit(): void {
    const hhId = this.auth?.activeHouseholdId() ?? null;
    if (!hhId || hhId !== this.lastLoadedHouseholdId) {
      this.lastLoadedHouseholdId = hhId;
      this.loadStores();
    }
  }

  showToast(type: 'success' | 'error', message: string): void {
    this.toast.emit({ type, message });
  }

  async loadStores(): Promise<void> {
    try {
      const list = [...(await this.api.getStores())].sort(compareByName);
      this.stores.set(list);
      if (list.length > 0) {
        if (!this.selectedAisleStoreId() || !list.some((s) => s.id === this.selectedAisleStoreId())) {
          this.selectAisleStore(list[0].id);
        }
      } else {
        this.selectedAisleStoreId.set('');
        this.currentStoreAisles.set([]);
      }
    } catch {
      this.showToast('error', 'Failed to load stores');
    }
  }

  openAddStoreModal(): void {
    this.editingStoreId.set(null);
    this.storeName.set('');
    this.storeDescription.set('');
    this.isStoreModalOpen.set(true);
  }

  openEditStoreModal(store: Store): void {
    this.editingStoreId.set(store.id);
    this.storeName.set(store.name);
    this.storeDescription.set(store.description || '');
    this.isStoreModalOpen.set(true);
  }

  closeStoreModal(): void {
    this.isStoreModalOpen.set(false);
  }

  async saveStore(): Promise<void> {
    const name = this.storeName().trim();
    if (!name) return;

    try {
      const editId = this.editingStoreId();
      if (editId) {
        await this.api.updateStore(editId, {
          name,
          description: this.storeDescription().trim() || undefined,
        });
        this.showToast('success', 'Store updated successfully');
      } else {
        await this.api.createStore({
          name,
          description: this.storeDescription().trim() || undefined,
        });
        this.showToast('success', 'New store added');
      }
      this.closeStoreModal();
      await this.loadStores();
    } catch {
      this.showToast('error', 'Failed to save store');
    }
  }

  async deleteStore(id: string): Promise<void> {
    const target = this.stores().find((s) => s.id === id);
    const ref = this.dialog.open(ConfirmModalComponent, {
      data: {
        title: 'Delete Store',
        message: `Are you sure you want to delete store "${target?.name || ''}"? Associated aisles will also be removed.`,
        confirmLabel: 'Delete Store',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await ref.closed.toPromise();
    if (!confirmed) return;

    try {
      await this.api.deleteStore(id);
      this.showToast('success', 'Store deleted');
      await this.loadStores();
    } catch {
      this.showToast('error', 'Failed to delete store');
    }
  }

  async selectAisleStore(storeId: string): Promise<void> {
    this.selectedAisleStoreId.set(storeId);
    this.cancelAisleEdit();
    this.newAisleName.set('');
    if (storeId) {
      await this.loadStoreAisles(storeId);
    } else {
      this.currentStoreAisles.set([]);
    }
  }

  async loadStoreAisles(storeId: string): Promise<void> {
    this.isLoadingAisles.set(true);
    try {
      const aisles = [...(await this.api.getStoreAisles(storeId))].sort(compareByNumericOrder);
      this.currentStoreAisles.set(aisles);
    } catch {
      this.currentStoreAisles.set([]);
    } finally {
      this.isLoadingAisles.set(false);
    }
  }

  async addAisle(): Promise<void> {
    const storeId = this.selectedAisleStoreId();
    const name = this.newAisleName().trim();
    if (!storeId || !name) return;

    try {
      const created = await this.api.createAisle(storeId, { name });
      this.currentStoreAisles.update((list) => [...list, created].sort(compareByNumericOrder));
      this.newAisleName.set('');
      this.showToast('success', `Aisle "${created.name}" created`);
    } catch {
      this.showToast('error', 'Failed to create aisle');
    }
  }

  startAisleEdit(aisle: Aisle): void {
    this.editingAisleId.set(aisle.id);
    this.editingAisleName.set(aisle.name);
  }

  cancelAisleEdit(): void {
    this.editingAisleId.set(null);
    this.editingAisleName.set('');
  }

  async saveAisleEdit(aisle: Aisle): Promise<void> {
    const name = this.editingAisleName().trim();
    if (!name || name === aisle.name) {
      this.cancelAisleEdit();
      return;
    }

    try {
      const updated = await this.api.updateAisle(aisle.id, { name });
      this.currentStoreAisles.update((list) =>
        list.map((a) => (a.id === aisle.id ? { ...a, ...updated } : a)).sort(compareByNumericOrder),
      );
      this.cancelAisleEdit();
      this.showToast('success', 'Aisle renamed');
    } catch {
      this.showToast('error', 'Failed to update aisle');
    }
  }

  async deleteAisle(id: string): Promise<void> {
    const aisle = this.currentStoreAisles().find((a) => a.id === id);
    const ref = this.dialog.open(ConfirmModalComponent, {
      data: {
        title: 'Delete Aisle',
        message: `Are you sure you want to delete aisle "${aisle?.name || ''}"?`,
        confirmLabel: 'Delete Aisle',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await ref.closed.toPromise();
    if (!confirmed) return;

    try {
      await this.api.deleteAisle(id);
      this.currentStoreAisles.update((list) => list.filter((a) => a.id !== id));
      this.showToast('success', 'Aisle deleted');
    } catch {
      this.showToast('error', 'Failed to delete aisle');
    }
  }

  async onAisleDrop(event: CdkDragDrop<Aisle[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;

    const items = [...this.currentStoreAisles()];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    const updated = items.map((a, idx) => ({ ...a, sortOrder: idx + 1 }));
    this.currentStoreAisles.set(updated);

    const storeId = this.selectedAisleStoreId();
    if (storeId) {
      try {
        await this.api.reorderStoreAisles(
          storeId,
          updated.map((a) => a.id),
        );
        this.showToast('success', 'Aisle order updated');
      } catch {
        this.showToast('error', 'Failed to save new aisle order');
      }
    }
  }
}
