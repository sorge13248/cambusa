import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import {
  LucideCalendar,
  LucidePackage,
  LucidePlus,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import {
  HouseholdMemberDto,
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
import { UndoService } from '../../../core/undo.service.js';
import { calculateAggregatedProductStock, calculateProductTotalStock } from '../../../core/stock-utils.js';
import { LocalDatePipe } from '../../../shared/pipes/local-date.pipe.js';
import { PlannerProductPickerModalComponent } from '../planner-product-picker-modal/planner-product-picker-modal.component.js';

export interface PlannerSlotModalData {
  date: string;
  dateLabel: string;
  mealSlot: MealSlot;
  mealSlotLabel: string;
  entries: MealPlanEntry[];
  stock: StockItem[];
  products: Product[];
  locations: Location[];
  productGroups: ProductGroup[];
  units: QuantityUnit[];
  savedFilters: SavedFilter[];
  members: HouseholdMemberDto[];
  expiringSoonDays: number;
}

export interface SlotFoodViewModel {
  entry: MealPlanEntry;
  productName: string;
  productPictureFileName: string | null;
  totalAmount: number;
  aggregatedAmount: number;
  quName: string | null;
  earliestBestBeforeDate: string | null;
  urgency: 'expired' | 'due_soon' | 'ok' | 'none';
  urgencyLabel: string | null;
  hasUnopenedBatch: boolean;
  batches: StockItem[];
  addedByMember: HouseholdMemberDto | null;
  addedByInitials: string;
}

@Component({
  selector: 'app-planner-slot-modal',
  standalone: true,
  imports: [
    CommonModule,
    LocalDatePipe,
    LucideCalendar,
    LucidePackage,
    LucidePlus,
    LucideTrash2,
    LucideX,
  ],
  templateUrl: './planner-slot-modal.component.html',
  styleUrl: './planner-slot-modal.component.scss',
})
export class PlannerSlotModalComponent {
  readonly data = inject<PlannerSlotModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly api = inject(ApiService);
  private readonly undoService = inject(UndoService);

  readonly entries = signal<MealPlanEntry[]>([...this.data.entries]);
  readonly stock = signal<StockItem[]>([...this.data.stock]);
  private modified = false;

  readonly foodItems = computed<SlotFoodViewModel[]>(() => {
    const prodMap = new Map(this.data.products.map((p) => [p.id, p]));
    const unitMap = new Map(this.data.units.map((u) => [u.id, u]));
    const memberMap = new Map(this.data.members.map((m) => [m.userId, m]));
    const allStock = this.stock();
    const expDays = this.data.expiringSoonDays || 5;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + expDays);
    const targetStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;

    return this.entries().map((entry) => {
      const prod = prodMap.get(entry.productId);
      const batches = allStock
        .filter((s) => s.productId === entry.productId)
        .sort((a, b) => {
          if (!a.bestBeforeDate) return 1;
          if (!b.bestBeforeDate) return -1;
          return a.bestBeforeDate.localeCompare(b.bestBeforeDate);
        });

      const totalAmount = calculateProductTotalStock(entry.productId, allStock);
      const aggregatedAmount = calculateAggregatedProductStock(entry.productId, this.data.products, allStock);
      const unit = prod?.quStockId ? unitMap.get(prod.quStockId) : undefined;
      const quName = batches[0]?.quName || unit?.name || null;

      const earliestBatch = batches.find((b) => b.bestBeforeDate && !b.bestBeforeDate.startsWith('2999')) || batches[0];
      const earliestBestBeforeDate =
        earliestBatch?.bestBeforeDate && !earliestBatch.bestBeforeDate.startsWith('2999')
          ? earliestBatch.bestBeforeDate
          : null;

      let urgency: 'expired' | 'due_soon' | 'ok' | 'none' = 'none';
      let urgencyLabel: string | null = null;
      if (earliestBestBeforeDate) {
        const bbd = earliestBestBeforeDate.slice(0, 10);
        if (bbd < todayStr) {
          urgency = 'expired';
        } else if (bbd <= targetStr) {
          urgency = 'due_soon';
        } else {
          urgency = 'ok';
        }

        const expParts = bbd.split('-');
        const expDate = new Date(Number(expParts[0]), Number(expParts[1]) - 1, Number(expParts[2]));
        const diffDays = Math.round((expDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        if (diffDays < 0) urgencyLabel = `${Math.abs(diffDays)}d overdue`;
        else if (diffDays === 0) urgencyLabel = 'Expires today';
        else urgencyLabel = `${diffDays}d left`;
      }

      const addedByMember = entry.userId ? memberMap.get(entry.userId) ?? null : null;
      const addedByInitials = this.computeInitials(addedByMember?.displayName);

      return {
        entry,
        productName: prod?.name || batches[0]?.productName || 'Unknown Product',
        productPictureFileName:
          (prod?.pictureFileNames && prod.pictureFileNames[0]) || batches[0]?.productPictureFileName || null,
        totalAmount,
        aggregatedAmount,
        quName,
        earliestBestBeforeDate,
        urgency,
        urgencyLabel,
        hasUnopenedBatch: batches.some((b) => !b.isOpen),
        batches,
        addedByMember,
        addedByInitials,
      };
    });
  });

  private computeInitials(name?: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  private async refreshStock(): Promise<void> {
    const items = await this.api.getStock(this.data.expiringSoonDays);
    this.stock.set(items);
    this.modified = true;
  }

  async openOne(item: SlotFoodViewModel): Promise<void> {
    const unopened = item.batches.filter((b) => !b.isOpen);
    const targetBatch = unopened[0];
    if (!targetBatch) return;

    const result = await this.api.openStock(targetBatch.id, 1);
    await this.refreshStock();

    this.undoService.register({
      description: `Opened 1 ${item.quName || 'unit'} of ${item.productName}`,
      onUndo: async () => {
        await this.api.revertOpen({
          openedStockItemId: result.openedStockItem.id,
          originalStockItemId: result.originalStockItem ? result.originalStockItem.id : targetBatch.id,
          split: result.split,
          amount: 1,
          originalDate: result.originalDate,
          originalLocationId: result.originalLocationId,
        });
        await this.refreshStock();
      },
    });
  }

  async consumeOne(item: SlotFoodViewModel): Promise<void> {
    const targetBatch = item.batches[0];
    if (!targetBatch || item.totalAmount <= 0) return;

    await this.api.consumeStock(targetBatch.id, 1);
    await this.refreshStock();

    this.undoService.register({
      description: `Consumed 1 ${item.quName || 'unit'} of ${item.productName}`,
      onUndo: async () => {
        await this.api.addStock({
          productId: targetBatch.productId,
          amount: 1,
          locationId: targetBatch.locationId,
          bestBeforeDate: targetBatch.bestBeforeDate,
        });
        await this.refreshStock();
      },
    });
  }

  async removeEntry(item: SlotFoodViewModel): Promise<void> {
    const removed = item.entry;
    await this.api.deleteMealPlanEntry(removed.id);
    this.entries.update((list) => list.filter((e) => e.id !== removed.id));
    this.modified = true;

    this.undoService.register({
      description: `Removed ${item.productName} from ${this.data.mealSlotLabel}`,
      onUndo: async () => {
        const restored = await this.api.addMealPlanEntry({
          date: removed.date,
          mealSlot: removed.mealSlot,
          productId: removed.productId,
          sortOrder: removed.sortOrder,
        });
        this.entries.update((list) => [...list, restored]);
        this.modified = true;
      },
    });
  }

  openProductPicker(): void {
    const ref = this.dialog.open(PlannerProductPickerModalComponent, {
      disableClose: false,
      data: {
        date: this.data.date,
        dateLabel: this.data.dateLabel,
        mealSlot: this.data.mealSlot,
        mealSlotLabel: this.data.mealSlotLabel,
        stock: this.stock(),
        products: this.data.products,
        locations: this.data.locations,
        productGroups: this.data.productGroups,
        units: this.data.units,
        savedFilters: this.data.savedFilters,
        expiringSoonDays: this.data.expiringSoonDays,
        initialProductIds: this.entries().map((e) => e.productId),
        onEntryAdded: (entry: MealPlanEntry) => {
          this.entries.update((list) => [...list, entry]);
          this.modified = true;
        },
      },
    });

    firstValueFrom(ref.closed).catch(() => {});
  }

  close(): void {
    this.dialogRef.close({ refreshed: this.modified });
  }
}
