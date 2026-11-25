import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { LucideAlertTriangle, LucidePencil, LucideX } from '@lucide/angular';
import { Location, Product, StockItem } from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';
import { compareByName } from '../../../core/sorting.utils.js';
import { UndoService } from '../../../core/undo.service.js';
import { CdkDatepickerComponent } from '../../../shared/components/datepicker/cdk-datepicker.component.js';
import { NumberStepperComponent } from '../../../shared/components/number-stepper/number-stepper.component.js';

export interface StockItemEditorModalData {
  stockItem: StockItem;
  locations: Location[];
  product?: Product;
}

@Component({
  selector: 'app-stock-item-editor-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkDatepickerComponent,
    NumberStepperComponent,
    LucideAlertTriangle,
    LucidePencil,
    LucideX,
  ],
  templateUrl: './stock-item-editor-modal.component.html',
  styleUrl: './stock-item-editor-modal.component.scss',
})
export class StockItemEditorModalComponent {
  readonly data = inject<StockItemEditorModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly api = inject(ApiService);
  private readonly undoService = inject(UndoService);

  amount = this.data.stockItem.amount || 1;
  bestBeforeDate: string | null = this.data.stockItem.bestBeforeDate || null;
  readonly locationId = signal<string>(this.data.stockItem.locationId || '');
  price: number | null = this.data.stockItem.price ?? null;
  note: string = this.data.stockItem.note || '';
  isOpen: boolean = !!this.data.stockItem.isOpen;
  openedDate: string | null = this.data.stockItem.openedDate || null;

  readonly isSaving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly cannotFreeze = computed(() => {
    return !!(this.data.product?.cannotBeFrozen ?? this.data.stockItem.productCannotBeFrozen);
  });

  readonly availableLocations = computed(() => {
    const base = this.cannotFreeze()
      ? this.data.locations.filter((l) => !l.isFreezer)
      : [...this.data.locations];
    return base.sort(compareByName);
  });

  readonly selectedLocation = computed(() => {
    return this.data.locations.find((l) => l.id === this.locationId()) || null;
  });

  readonly freezerWarning = computed(() => {
    const loc = this.selectedLocation();
    return !!(loc?.isFreezer && this.cannotFreeze());
  });

  adjustAmount(delta: number) {
    const next = Math.max(1, (this.amount || 1) + delta);
    this.amount = next;
  }

  onToggleOpen() {
    if (this.isOpen && !this.openedDate) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      this.openedDate = `${y}-${m}-${d}`;
    } else if (!this.isOpen) {
      this.openedDate = null;
    }
  }

  async save() {
    if (this.amount <= 0) {
      this.errorMessage.set('Amount must be greater than zero.');
      return;
    }

    if (this.freezerWarning()) {
      this.errorMessage.set('This product is marked as "Cannot be frozen" and cannot be stored in a freezer location.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    const oldItem: StockItem = { ...this.data.stockItem };
    const patchData = {
      amount: this.amount,
      bestBeforeDate: this.bestBeforeDate,
      locationId: this.locationId() || null,
      price: this.price !== null && !isNaN(this.price) ? this.price : null,
      note: this.note.trim() || null,
      isOpen: this.isOpen,
      openedDate: this.isOpen ? this.openedDate : null,
    };

    try {
      const updated = await this.api.updateStockItem(this.data.stockItem.id, patchData);

      // Register undo closure according to 10-second reversible mutation rule
      const productName = this.data.stockItem.productName || this.data.product?.name || 'Item';
      this.undoService.register(
        `Updated batch for "${productName}"`,
        async () => {
          await this.api.updateStockItem(oldItem.id, {
            amount: oldItem.amount,
            bestBeforeDate: oldItem.bestBeforeDate,
            locationId: oldItem.locationId,
            price: oldItem.price,
            note: oldItem.note,
            isOpen: oldItem.isOpen,
            openedDate: oldItem.openedDate,
          });
        },
      );

      this.dialogRef.close({
        updated: true,
        stockItem: {
          ...this.data.stockItem,
          ...updated,
          locationName: this.selectedLocation()?.name || this.data.stockItem.locationName,
        },
      });
    } catch (err: any) {
      console.error('Failed to update stock item:', err);
      this.errorMessage.set(err?.error?.message || err?.message || 'Failed to update stock batch.');
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel() {
    this.dialogRef.close();
  }
}
