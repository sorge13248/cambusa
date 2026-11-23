import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { Location, Product, QuantityUnit, StockItem, Store } from '../../../core/models.js';
import { AutocompleteDirective, AutocompleteOption } from '../../../shared/directives/autocomplete.directive.js';
import { StockPurchaseFormComponent } from '../stock-purchase-form/stock-purchase-form.component.js';

export interface PantryAddItemModalData {
  products: Product[];
  locations: Location[];
  stores: Store[];
  units: QuantityUnit[];
  preselectedProductId?: string;
}

@Component({
  selector: 'app-pantry-add-item-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AutocompleteDirective, StockPurchaseFormComponent],
  templateUrl: './pantry-add-item-modal.component.html',
  styleUrl: './pantry-add-item-modal.component.scss',
})
export class PantryAddItemModalComponent implements OnInit, OnDestroy {
  readonly data = inject<PantryAddItemModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private subs = new Subscription();

  readonly selectedProductId = signal<string | null>(this.data?.preselectedProductId || null);
  isProductValid = true;

  readonly activeProducts = computed(() => {
    return (this.data?.products || []).filter((p) => p.active !== false);
  });

  readonly productOptions = computed<AutocompleteOption[]>(() => {
    return this.activeProducts().map((p) => ({
      id: p.id,
      label: p.name,
      subLabel: p.hierarchyPath || (p.barcodes && p.barcodes.length > 0 ? p.barcodes.join(', ') : undefined),
    }));
  });

  readonly selectedProduct = computed(() => {
    const id = this.selectedProductId();
    if (!id) return null;
    return this.activeProducts().find((p) => p.id === id) || null;
  });

  ngOnInit(): void {
    this.subs.add(
      this.dialogRef.backdropClick.subscribe(() => {
        this.close();
      }),
    );

    this.subs.add(
      this.dialogRef.keydownEvents.subscribe((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onProductSelected(id: string | null): void {
    this.selectedProductId.set(id);
    if (id) {
      this.isProductValid = true;
    }
  }

  clearSelectedProduct(input?: HTMLInputElement): void {
    if (input) {
      input.value = '';
    }
    this.selectedProductId.set(null);
    this.isProductValid = true;
  }

  onPurchaseSuccess(item: StockItem): void {
    this.dialogRef.close({ refreshed: true, stockItem: item });
  }

  close(): void {
    this.dialogRef.close();
  }
}
