import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Location, Product, QuantityUnit, StockItem, Store } from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';
import { compareByName } from '../../../core/sorting.utils.js';
import { UndoService } from '../../../core/undo.service.js';
import { CdkDatepickerComponent } from '../../../shared/components/datepicker/cdk-datepicker.component.js';
import { NumberStepperComponent } from '../../../shared/components/number-stepper/number-stepper.component.js';

@Component({
  selector: 'app-stock-purchase-form',
  standalone: true,
  imports: [CommonModule, FormsModule, CdkDatepickerComponent, NumberStepperComponent],
  templateUrl: './stock-purchase-form.component.html',
  styleUrl: './stock-purchase-form.component.scss',
})
export class StockPurchaseFormComponent implements OnInit, OnChanges {
  private readonly api = inject(ApiService);
  private readonly undoService = inject(UndoService);

  @Input({ required: true }) product!: Product;
  @Input() locations: Location[] = [];
  @Input() stores: Store[] = [];
  @Input() units: QuantityUnit[] = [];
  @Input() showHeader = true;
  @Input() headerTitle = 'Purchase / Add to Pantry';
  @Input() submitLabel = 'Confirm Purchase';
  @Input() showCancel = true;

  @Output() submitted = new EventEmitter<StockItem>();
  @Output() cancelled = new EventEmitter<void>();

  purchaseAmount = 1;
  purchaseDate = new Date().toISOString().slice(0, 10);
  purchaseBestBeforeDate: string | null = null;
  purchasePrice: number | null = null;
  purchasePriceMode: 'total' | 'unit' = 'total';
  purchaseStoreId = '';
  purchaseLocationId = '';
  purchaseNote = '';
  isSubmitting = false;

  get availableLocations(): Location[] {
    const base = this.product?.cannotBeFrozen
      ? (this.locations || []).filter((l) => !l.isFreezer)
      : [...(this.locations || [])];
    return base.sort(compareByName);
  }

  get sortedStores(): Store[] {
    return [...(this.stores || [])].sort(compareByName);
  }

  get stockUnitName(): string {
    const qu = this.units?.find((u) => u.id === this.product?.quStockId);
    return qu?.name || '';
  }

  ngOnInit(): void {
    this.initProductDefaults();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] && !changes['product'].firstChange) {
      this.initProductDefaults();
    }
  }

  private initProductDefaults(): void {
    if (!this.product) return;

    if (this.product.cannotBeFrozen) {
      const defLoc = this.locations.find((l) => l.id === this.product.defaultLocationId);
      if (defLoc && !defLoc.isFreezer) {
        this.purchaseLocationId = defLoc.id;
      } else if (!this.product.defaultLocationId) {
        this.purchaseLocationId = this.availableLocations[0]?.id ?? '';
      } else {
        // defaultLocationId was a freezer location or unknown
        const firstNonFreezer = this.availableLocations[0];
        this.purchaseLocationId = firstNonFreezer?.id ?? '';
      }
    } else {
      this.purchaseLocationId = this.product.defaultLocationId || (this.locations[0]?.id ?? '');
    }

    this.purchaseBestBeforeDate = this.calculateBestBeforeDate(this.purchaseLocationId);
    this.purchaseStoreId = this.product.defaultStoreId || '';
  }

  onLocationChange(locationId: string): void {
    this.purchaseLocationId = locationId;
    this.purchaseBestBeforeDate = this.calculateBestBeforeDate(locationId);
  }

  private calculateBestBeforeDate(locationId: string): string | null {
    if (!this.product) return null;
    const chosenLoc = this.locations.find((l) => l.id === locationId);
    const isFreezer = Boolean(chosenLoc?.isFreezer && !this.product.cannotBeFrozen);
    const days =
      isFreezer &&
      this.product.defaultBestBeforeDaysAfterFreezing &&
      this.product.defaultBestBeforeDaysAfterFreezing > 0
        ? this.product.defaultBestBeforeDaysAfterFreezing
        : this.product.defaultBestBeforeDays;

    if (days && days > 0) {
      const target = new Date();
      target.setDate(target.getDate() + days);
      return target.toISOString().slice(0, 10);
    }
    return null;
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  async submitPurchase(): Promise<void> {
    if (this.purchaseAmount <= 0 || !this.product || this.isSubmitting) return;

    if (this.product.cannotBeFrozen && this.purchaseLocationId) {
      const chosenLoc = this.locations.find((l) => l.id === this.purchaseLocationId);
      if (chosenLoc?.isFreezer) return;
    }

    this.isSubmitting = true;
    try {
      let finalPrice: number | null = null;
      if (this.purchasePrice !== null && this.purchasePrice !== undefined) {
        if (this.purchasePriceMode === 'total' && this.purchaseAmount > 0) {
          finalPrice = Math.round((this.purchasePrice / this.purchaseAmount) * 100) / 100;
        } else {
          finalPrice = this.purchasePrice;
        }
      }

      const added = await this.api.addStock({
        productId: this.product.id,
        amount: this.purchaseAmount,
        purchasedDate: this.purchaseDate,
        bestBeforeDate: this.purchaseBestBeforeDate,
        price: finalPrice,
        locationId: this.purchaseLocationId || null,
        note: this.purchaseNote || null,
      });

      const purchasedAmount = this.purchaseAmount;
      const qu = this.units?.find((u) => u.id === this.product.quStockId);
      const unitName = qu?.name || 'units';

      this.undoService.register({
        description: `Purchased ${purchasedAmount} ${unitName} of ${this.product.name}`,
        onUndo: async () => {
          if (added?.id) {
            await this.api.consumeStock(added.id, purchasedAmount);
          }
        },
      });

      this.submitted.emit(added);
    } catch (err) {
      console.error('Failed to submit purchase:', err);
    } finally {
      this.isSubmitting = false;
    }
  }
}
