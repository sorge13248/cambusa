import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom, Subscription } from 'rxjs';
import {
  LucideAlertCircle,
  LucideAlertTriangle,
  LucideClock,
  LucideInfo,
  LucidePackage,
  LucidePencil,
  LucideRotateCw,
  LucideShoppingCart,
  LucideUtensils,
  LucideX,
} from '@lucide/angular';
import { Location, MealieLinkedFood, MealieRecipeSummary, Product, QuantityUnit, StockItem, Store } from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';
import { compareByName } from '../../../core/sorting.utils.js';
import { UndoService } from '../../../core/undo.service.js';
import { calculateProductTotalStock } from '../../../core/stock-utils.js';
import { QuickDateModifierComponent } from '../../../shared/components/quick-date-modifier/quick-date-modifier.component.js';
import { ProductInfoModalComponent } from '../../products/product-info-modal/product-info-modal.component.js';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component.js';
import { LocalDatePipe } from '../../../shared/pipes/local-date.pipe.js';
import { StockPurchaseFormComponent } from '../stock-purchase-form/stock-purchase-form.component.js';
import { StockItemEditorModalComponent } from '../stock-item-editor-modal/stock-item-editor-modal.component.js';
import { NumberStepperComponent } from '../../../shared/components/number-stepper/number-stepper.component.js';

export interface PantryActionModalData {
  product: Product;
  stockItems: StockItem[];
  locations: Location[];
  stores: Store[];
  units: QuantityUnit[];
  allProducts?: Product[];
  productGroups?: any[];
}

export type ActionType = 'none' | 'consume' | 'purchase' | 'move';

@Component({
  selector: 'app-pantry-action-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NumberStepperComponent,
    QuickDateModifierComponent,
    LocalDatePipe,
    StockPurchaseFormComponent,
    LucideAlertCircle,
    LucideAlertTriangle,
    LucideClock,
    LucideInfo,
    LucidePackage,
    LucidePencil,
    LucideRotateCw,
    LucideShoppingCart,
    LucideUtensils,
    LucideX,
  ],
  templateUrl: './pantry-action-modal.component.html',
  styleUrl: './pantry-action-modal.component.scss',
})
export class PantryActionModalComponent implements OnInit, OnDestroy {
  readonly data = inject<PantryActionModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly undoService = inject(UndoService);

  readonly activeAction = signal<ActionType>('none');
  readonly currentStockItems = signal<StockItem[]>([...this.data.stockItems]);
  productModified = false;
  lastAction: any = null;
  private subs = new Subscription();

  // Consume state
  consumeAmount = 1;
  consumeLocationId = '';
  consumeStockItemId = '';
  consumeIsSpoiled = false;
  consumeMarkAsOpen = false;

  // Move state
  moveFromLocationId = '';
  moveToLocationId = '';
  moveAmount = 1;
  moveStockItemId = '';
  readonly moveFreezerWarning = signal<boolean>(false);
  readonly recalculatedExpiryInfo = signal<string | null>(null);

  // Mealie Integration state
  readonly isMealieConfigured = signal<boolean>(false);
  readonly isLoadingMealie = signal<boolean>(false);
  readonly isRefreshingMealie = signal<boolean>(false);
  readonly mealieRecipes = signal<MealieRecipeSummary[]>([]);
  readonly mealieFoods = signal<MealieLinkedFood[]>([]);
  readonly mealieUrl = signal<string>('');
  readonly mealieError = signal<string | null>(null);

  readonly hasMealieAssociations = computed(() => {
    return this.isMealieConfigured() && (this.mealieRecipes().length > 0 || this.mealieFoods().length > 0);
  });

  readonly productStockItems = computed(() => {
    return this.currentStockItems().filter((s) => s.productId === this.data.product.id);
  });

  readonly totalStockAmount = computed(() => {
    return calculateProductTotalStock(this.data.product.id, this.currentStockItems());
  });

  readonly availableLocations = computed(() => {
    const locIds = new Set(this.productStockItems().map((s) => s.locationId).filter(Boolean));
    return this.data.locations.filter((l) => locIds.has(l.id)).sort(compareByName);
  });

  readonly moveTargetLocations = computed(() => {
    const base = this.data.product.cannotBeFrozen
      ? this.data.locations.filter((l) => !l.isFreezer)
      : [...this.data.locations];
    return base.sort(compareByName);
  });

  readonly productGroupName = computed(() => {
    return null;
  });

  readonly mainPhotoUrl = computed(() => {
    const pics = this.data.product.pictureFileNames;
    if (pics && pics.length > 0) {
      return `/api/products/pictures/${pics[0]}`;
    }
    return null;
  });

  readonly stockUnitName = computed(() => {
    const qu = this.data.units.find((u) => u.id === this.data.product.quStockId);
    return qu?.name || 'units';
  });

  readonly locationSummary = computed(() => {
    const locNames = this.productStockItems()
      .map((s) => s.locationName)
      .filter((n, idx, arr) => n && arr.indexOf(n) === idx);
    return locNames.length > 0 ? locNames.join(', ') : 'No location set';
  });

  readonly nextExpirationDate = computed(() => {
    const dates = this.productStockItems()
      .map((s) => s.bestBeforeDate)
      .filter(Boolean) as string[];
    dates.sort();
    return dates[0] || null;
  });

  readonly nextExpirationUrgent = computed(() => {
    const next = this.nextExpirationDate();
    if (!next) return false;
    const diff = (new Date(next).getTime() - new Date().getTime()) / (24 * 3600 * 1000);
    return diff <= 3;
  });

  ngOnInit(): void {
    this.loadMealieRecipes(false);

    this.subs.add(
      this.dialogRef.backdropClick.subscribe(() => {
        this.requestClose();
      }),
    );

    this.subs.add(
      this.dialogRef.keydownEvents.subscribe((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.requestClose();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  setAction(action: ActionType): void {
    this.activeAction.set(this.activeAction() === action ? 'none' : action);
  }

  adjustConsumeAmount(delta: number): void {
    this.consumeAmount = Math.max(1, this.consumeAmount + delta);
  }

  onTargetLocationChanged(): void {
    const targetLoc = this.data.locations.find((l) => l.id === this.moveToLocationId);
    if (targetLoc?.isFreezer && this.data.product.cannotBeFrozen) {
      this.moveFreezerWarning.set(true);
      this.recalculatedExpiryInfo.set(null);
      return;
    }
    this.moveFreezerWarning.set(false);

    if (targetLoc?.isFreezer && this.data.product.defaultBestBeforeDaysAfterFreezing) {
      const target = new Date();
      target.setDate(target.getDate() + this.data.product.defaultBestBeforeDaysAfterFreezing);
      this.recalculatedExpiryInfo.set(target.toISOString().slice(0, 10));
    } else {
      this.recalculatedExpiryInfo.set(null);
    }
  }

  navigateToGroupPantry(): void {
    const groupId = this.data.product.productGroupId;
    if (!groupId) return;
    this.dialog.closeAll();
    void this.router.navigate(['/pantry'], { queryParams: { group: groupId } });
  }

  async openEditProduct(): Promise<void> {
    const dialogRef = this.dialog.open(ProductInfoModalComponent, {
      disableClose: true,
      data: {
        product: this.data.product,
        allProducts: this.data.allProducts || [this.data.product],
        productGroups: this.data.productGroups || [],
        locations: this.data.locations,
        units: this.data.units,
        stores: this.data.stores,
      },
    });

    const res: any = await firstValueFrom(dialogRef.closed);
    if (res && typeof res === 'object' && res.product) {
      this.data.product = res.product;
      this.productModified = true;
      if (this.data.allProducts) {
        this.data.allProducts = this.data.allProducts.map((p) =>
          p.id === res.product.id ? res.product : p
        );
      }
      this.mealieFoods.set([...(res.product.mealieFoods || [])]);
      await this.loadMealieRecipes(true);
    }
  }

  async loadMealieRecipes(forceRefresh = false): Promise<void> {
    if (forceRefresh) {
      this.isRefreshingMealie.set(true);
    } else {
      this.isLoadingMealie.set(true);
    }
    this.mealieError.set(null);

    if (this.data.product.mealieFoods) {
      this.mealieFoods.set([...this.data.product.mealieFoods]);
    } else {
      this.mealieFoods.set([]);
    }

    try {
      const status = await this.api.getMealieStatus();
      this.isMealieConfigured.set(status.configured);
      if (status.configured) {
        this.mealieUrl.set(status.mealieUrl || '');
        const res = await this.api.getProductMealieRecipes(this.data.product.id, forceRefresh);
        this.mealieRecipes.set(res.recipes || []);
        this.mealieFoods.set(res.foods || []);
        if (res.mealieUrl) {
          this.mealieUrl.set(res.mealieUrl);
        }
      }
    } catch (err: any) {
      this.mealieError.set(err?.error?.message || err?.message || 'Failed to load Mealie recipes');
    } finally {
      this.isLoadingMealie.set(false);
      this.isRefreshingMealie.set(false);
    }
  }

  getMealieFoodUrl(foodId: string): string {
    const base = this.mealieUrl().replace(/\/$/, '');
    return `${base}/g/home?foods=${encodeURIComponent(foodId)}`;
  }

  getMealieRecipeUrl(slug: string): string {
    const base = this.mealieUrl().replace(/\/$/, '');
    return `${base}/g/home/r/${encodeURIComponent(slug)}`;
  }

  openRecipe(slug: string): void {
    window.open(this.getMealieRecipeUrl(slug), '_blank', 'noopener,noreferrer');
  }

  openEditStockItem(item: StockItem): void {
    const editRef = this.dialog.open(StockItemEditorModalComponent, {
      disableClose: true,
      data: {
        stockItem: item,
        locations: this.data.locations,
        product: this.data.product,
      },
    });

    firstValueFrom(editRef.closed).then((res: any) => {
      if (res && res.updated && res.stockItem) {
        this.productModified = true;
        const updatedItem = res.stockItem;
        this.currentStockItems.set(
          this.currentStockItems().map((s) => (s.id === updatedItem.id ? { ...s, ...updatedItem } : s)),
        );
      }
    });
  }

  async onQuickDateChange(item: StockItem, newDate: string | null): Promise<void> {
    const previousDate = item.bestBeforeDate;
    await this.api.adjustDate(item.id, { explicitDate: newDate || undefined });
    item.bestBeforeDate = newDate;
    this.productModified = true;
    this.lastAction = {
      action: 'adjustDate',
      stockItemId: item.id,
      newDate,
      previousDate,
      productId: this.data.product.id,
    };
    this.currentStockItems.update((items) =>
      items.map((s) => (s.id === item.id ? { ...s, bestBeforeDate: newDate } : s)),
    );

    this.undoService.register({
      description: `Updated expiration for ${this.data.product.name} to ${newDate || 'Never'}`,
      onUndo: async () => {
        await this.api.adjustDate(item.id, { explicitDate: previousDate || undefined });
        item.bestBeforeDate = previousDate;
        this.productModified = true;
        this.currentStockItems.update((items) =>
          items.map((s) => (s.id === item.id ? { ...s, bestBeforeDate: previousDate } : s)),
        );
      },
    });
  }

  async submitConsume(): Promise<void> {
    const items = this.productStockItems();
    if (items.length === 0) return;

    const targetItem = this.consumeStockItemId
      ? items.find((i) => i.id === this.consumeStockItemId)
      : (this.consumeLocationId ? items.find((i) => i.locationId === this.consumeLocationId) : items[0]);

    if (!targetItem) return;

    const amount = this.consumeAmount;

    if (this.consumeMarkAsOpen) {
      const result = await this.api.openStock(targetItem.id, amount);
      this.undoService.register({
        description: `Opened ${amount} ${this.stockUnitName()} of ${this.data.product.name}`,
        onUndo: async () => {
          await this.api.revertOpen({
            openedStockItemId: result.openedStockItem.id,
            originalStockItemId: result.originalStockItem ? result.originalStockItem.id : targetItem.id,
            split: result.split,
            amount,
            originalDate: result.originalDate,
            originalLocationId: result.originalLocationId,
          });
        },
      });

      this.dialogRef.close({
        refreshed: true,
        action: 'open',
        stockItemId: targetItem.id,
        amount,
        productId: this.data.product.id,
        updatedProduct: this.productModified ? this.data.product : undefined,
      });
    } else {
      await this.api.consumeStock(targetItem.id, amount, {
        isSpoiled: this.consumeIsSpoiled,
        locationId: this.consumeLocationId || undefined,
      });

      this.undoService.register({
        description: `Consumed ${amount} ${this.stockUnitName()} of ${this.data.product.name}`,
        onUndo: async () => {
          await this.api.addStock({
            productId: this.data.product.id,
            amount,
            locationId: targetItem.locationId,
            bestBeforeDate: targetItem.bestBeforeDate,
          });
        },
      });

      this.dialogRef.close({
        refreshed: true,
        action: 'consume',
        stockItemId: targetItem.id,
        amount,
        productId: this.data.product.id,
        updatedProduct: this.productModified ? this.data.product : undefined,
      });
    }
  }

  onPurchaseSubmitted(_item: StockItem): void {
    this.dialogRef.close({
      refreshed: true,
      action: 'purchase',
      stockItem: _item,
      amount: _item.amount,
      productId: this.data.product.id,
      updatedProduct: this.productModified ? this.data.product : undefined,
    });
  }

  async submitMove(): Promise<void> {
    if (!this.moveToLocationId || this.moveFreezerWarning()) return;
    const destLoc = this.data.locations.find((l) => l.id === this.moveToLocationId);
    if (destLoc?.isFreezer && this.data.product.cannotBeFrozen) return;

    const items = this.productStockItems();
    const sourceLocId = this.moveFromLocationId || (items[0]?.locationId ?? null);

    const res = await this.api.transferStock({
      productId: this.data.product.id,
      stockItemId: this.moveStockItemId || undefined,
      fromLocationId: this.moveFromLocationId || undefined,
      toLocationId: this.moveToLocationId,
      amount: this.moveAmount,
    });

    const movedAmount = this.moveAmount;
    const destLocId = this.moveToLocationId;
    this.undoService.register({
      description: `Moved ${movedAmount} of ${this.data.product.name}`,
      onUndo: async () => {
        if (sourceLocId) {
          await this.api.transferStock({
            productId: this.data.product.id,
            fromLocationId: destLocId,
            toLocationId: sourceLocId,
            amount: movedAmount,
          });
        }
      },
    });

    this.dialogRef.close({
      refreshed: true,
      action: 'move',
      stockItemId: this.moveStockItemId || items[0]?.id,
      locationName: destLoc?.name || 'New Location',
      amount: this.moveAmount,
      productId: this.data.product.id,
      updatedProduct: this.productModified ? this.data.product : undefined,
    });
  }

  async requestClose(): Promise<void> {
    if (this.activeAction() !== 'none') {
      const confirmRef = this.dialog.open(ConfirmModalComponent, {
        data: {
          title: 'Unsaved Changes',
          message: 'You have an active inventory action in progress. Are you sure you want to discard your changes and close?',
          confirmLabel: 'Discard Action',
          confirmVariant: 'danger',
        },
      });
      const confirmed = await firstValueFrom(confirmRef.closed);
      if (!confirmed) return;
    }
    this.close();
  }

  close(): void {
    this.dialogRef.close(
      this.lastAction
        ? { refreshed: true, ...this.lastAction, updatedProduct: this.data.product }
        : this.productModified
          ? { refreshed: true, updatedProduct: this.data.product }
          : undefined,
    );
  }
}
