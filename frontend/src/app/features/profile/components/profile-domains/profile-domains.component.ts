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
import { Aisle, ProductCustomField, ProductCustomFieldType, Store } from '../../../../core/models.js';
import { TabItem, TabViewComponent } from '../../../../shared/components/tab-view/tab-view.component.js';
import {
  LucideGripVertical,
  LucidePencil,
  LucideShoppingCart,
  LucideSlidersHorizontal,
  LucideStore,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component.js';

export type DomainTab = 'stores' | 'aisles' | 'custom-fields';

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
    LucideSlidersHorizontal,
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
    { id: 'custom-fields', label: 'Product Custom Fields', lucideIcon: 'sliders-horizontal' },
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

  // Product Custom Fields state
  readonly customFields = signal<ProductCustomField[]>([]);
  readonly isLoadingCustomFields = signal<boolean>(false);
  readonly isCustomFieldModalOpen = signal<boolean>(false);
  readonly editingCustomFieldId = signal<string | null>(null);
  readonly customFieldName = signal<string>('');
  readonly customFieldDescription = signal<string>('');
  readonly customFieldPlaceholder = signal<string>('');
  readonly customFieldType = signal<ProductCustomFieldType>('string');
  readonly customFieldDefaultValue = signal<string>('');
  readonly customFieldDefaultBool = signal<boolean>(false);

  readonly customFieldTypeOptions: Array<{ value: ProductCustomFieldType; label: string }> = [
    { value: 'string', label: 'String (Single Line)' },
    { value: 'textarea', label: 'Textarea (Multi-line)' },
    { value: 'int', label: 'Integer' },
    { value: 'double', label: 'Double (Decimal)' },
    { value: 'boolean', label: 'Boolean (Checkbox)' },
  ];

  readonly toast = output<{ type: 'success' | 'error'; message: string }>();

  constructor() {
    this.lastSyncCount = this.syncService?.onSyncCompleted() ?? 0;

    effect(() => {
      const hhId = this.auth?.activeHouseholdId() ?? null;
      if (hhId && hhId !== this.lastLoadedHouseholdId) {
        this.lastLoadedHouseholdId = hhId;
        untracked(() => {
          this.loadStores();
          this.loadCustomFields();
        });
      }
    });

    effect(() => {
      const syncCount = this.syncService?.onSyncCompleted() ?? 0;
      if (syncCount > 0 && syncCount !== this.lastSyncCount) {
        this.lastSyncCount = syncCount;
        untracked(() => {
          this.loadStores();
          this.loadCustomFields();
        });
      }
    });
  }

  ngOnInit(): void {
    const hhId = this.auth?.activeHouseholdId() ?? null;
    if (!hhId || hhId !== this.lastLoadedHouseholdId) {
      this.lastLoadedHouseholdId = hhId;
      this.loadStores();
      this.loadCustomFields();
    } else if (this.customFields().length === 0) {
      this.loadCustomFields();
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

  // Product Custom Fields
  async loadCustomFields(): Promise<void> {
    if (typeof this.api.getProductCustomFields !== 'function') return;
    this.isLoadingCustomFields.set(true);
    try {
      const fields = [...(await this.api.getProductCustomFields())].sort(compareByNumericOrder);
      this.customFields.set(fields);
    } catch {
      this.showToast('error', 'Failed to load custom fields');
    } finally {
      this.isLoadingCustomFields.set(false);
    }
  }

  openAddCustomFieldModal(): void {
    this.editingCustomFieldId.set(null);
    this.customFieldName.set('');
    this.customFieldDescription.set('');
    this.customFieldPlaceholder.set('');
    this.customFieldType.set('string');
    this.customFieldDefaultValue.set('');
    this.customFieldDefaultBool.set(false);
    this.isCustomFieldModalOpen.set(true);
  }

  openEditCustomFieldModal(field: ProductCustomField): void {
    this.editingCustomFieldId.set(field.id);
    this.customFieldName.set(field.name);
    this.customFieldDescription.set(field.description || '');
    this.customFieldPlaceholder.set(field.placeholder || '');
    this.customFieldType.set(field.type);
    if (field.type === 'boolean') {
      this.customFieldDefaultBool.set(field.defaultValue === 'true');
      this.customFieldDefaultValue.set('');
    } else {
      this.customFieldDefaultValue.set(field.defaultValue || '');
      this.customFieldDefaultBool.set(false);
    }
    this.isCustomFieldModalOpen.set(true);
  }

  closeCustomFieldModal(): void {
    this.isCustomFieldModalOpen.set(false);
  }

  onCustomFieldTypeChange(nextType: ProductCustomFieldType): void {
    this.customFieldType.set(nextType);
    if (nextType === 'boolean') {
      this.customFieldDefaultBool.set(this.customFieldDefaultValue() === 'true');
    }
  }

  async saveCustomField(): Promise<void> {
    const name = this.customFieldName().trim();
    if (!name) return;

    const type = this.customFieldType();
    const defaultValue =
      type === 'boolean'
        ? String(this.customFieldDefaultBool())
        : this.customFieldDefaultValue().trim() || null;

    const payload: Partial<ProductCustomField> = {
      name,
      description: this.customFieldDescription().trim() || null,
      placeholder: type === 'boolean' ? null : this.customFieldPlaceholder().trim() || null,
      type,
      defaultValue,
    };

    try {
      const editId = this.editingCustomFieldId();
      if (editId) {
        await this.api.updateProductCustomField(editId, payload);
        this.showToast('success', 'Custom field updated');
      } else {
        await this.api.createProductCustomField(payload);
        this.showToast('success', 'Custom field created');
      }
      this.closeCustomFieldModal();
      await this.loadCustomFields();
    } catch {
      this.showToast('error', 'Failed to save custom field');
    }
  }

  async deleteCustomField(id: string): Promise<void> {
    const target = this.customFields().find((f) => f.id === id);
    const ref = this.dialog.open(ConfirmModalComponent, {
      data: {
        title: 'Delete Custom Field',
        message: `Are you sure you want to delete "${target?.name || ''}"? Existing values stored on products will no longer be displayed.`,
        confirmLabel: 'Delete Field',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await ref.closed.toPromise();
    if (!confirmed) return;

    try {
      await this.api.deleteProductCustomField(id);
      this.customFields.update((list) => list.filter((f) => f.id !== id));
      this.showToast('success', 'Custom field deleted');
    } catch {
      this.showToast('error', 'Failed to delete custom field');
    }
  }

  async onCustomFieldDrop(event: CdkDragDrop<ProductCustomField[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;

    const items = [...this.customFields()];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    const updated = items.map((f, idx) => ({ ...f, sortOrder: idx + 1 }));
    this.customFields.set(updated);

    try {
      await this.api.reorderProductCustomFields(updated.map((f) => f.id));
      this.showToast('success', 'Custom field order updated');
    } catch {
      this.showToast('error', 'Failed to save custom field order');
    }
  }
}
