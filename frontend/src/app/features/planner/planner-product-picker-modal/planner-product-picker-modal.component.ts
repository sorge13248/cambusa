import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { LucideX } from '@lucide/angular';
import {
  Location,
  MealPlanEntry,
  MealSlot,
  Product,
  ProductGroup,
  QuantityUnit,
  SavedFilter,
  StockItem,
} from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';
import {
  PantryCardItem,
  PantryInventoryGridComponent,
} from '../../../shared/components/pantry-inventory-grid/pantry-inventory-grid.component.js';

export interface PlannerProductPickerModalData {
  date: string;
  mealSlot: MealSlot;
  mealSlotLabel: string;
  dateLabel: string;
  stock: StockItem[];
  products: Product[];
  locations: Location[];
  productGroups: ProductGroup[];
  units: QuantityUnit[];
  savedFilters: SavedFilter[];
  expiringSoonDays: number;
  initialProductIds?: string[];
  onEntryAdded?: (entry: MealPlanEntry) => void;
}

@Component({
  selector: 'app-planner-product-picker-modal',
  standalone: true,
  imports: [CommonModule, PantryInventoryGridComponent, LucideX],
  templateUrl: './planner-product-picker-modal.component.html',
  styleUrl: './planner-product-picker-modal.component.scss',
})
export class PlannerProductPickerModalComponent {
  readonly data = inject<PlannerProductPickerModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly api = inject(ApiService);

  readonly selectedProductIds = signal<string[]>(this.data.initialProductIds ? [...this.data.initialProductIds] : []);
  readonly addedCount = signal<number>(0);

  async onProductPicked(card: PantryCardItem): Promise<void> {
    const entry = await this.api.addMealPlanEntry({
      date: this.data.date,
      mealSlot: this.data.mealSlot,
      productId: card.productId,
    });

    if (!this.selectedProductIds().includes(card.productId)) {
      this.selectedProductIds.update((ids) => [...ids, card.productId]);
    }
    this.addedCount.update((c) => c + 1);
    this.data.onEntryAdded?.(entry);
  }

  close(): void {
    this.dialogRef.close({ addedCount: this.addedCount() });
  }
}
