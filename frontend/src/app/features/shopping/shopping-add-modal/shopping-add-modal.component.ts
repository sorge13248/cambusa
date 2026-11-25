import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, computed, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom, Subscription } from 'rxjs';
import { LucideCamera, LucidePackage, LucideSparkles, LucideX } from '@lucide/angular';
import { Product, ShoppingListItem, Store } from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';
import { compareByName } from '../../../core/sorting.utils.js';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component.js';
import { LocalDatePipe } from '../../../shared/pipes/local-date.pipe.js';
import { BarcodeScannerComponent } from '../../../shared/components/barcode-scanner/barcode-scanner.component.js';
import { NumberStepperComponent } from '../../../shared/components/number-stepper/number-stepper.component.js';

export interface ShoppingAddModalData {
  products: Product[];
  stores: Store[];
  shoppingListId?: string;
  defaultStoreId?: string | null;
  itemToEdit?: ShoppingListItem;
}

@Component({
  selector: 'app-shopping-add-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LocalDatePipe,
    BarcodeScannerComponent,
    NumberStepperComponent,
    LucideCamera,
    LucidePackage,
    LucideSparkles,
    LucideX,
  ],
  templateUrl: './shopping-add-modal.component.html',
  styleUrl: './shopping-add-modal.component.scss',
})
export class ShoppingAddModalComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly data = inject<ShoppingAddModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly api = inject(ApiService);

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  readonly isEditMode = computed(() => !!this.data.itemToEdit);

  readonly searchQuery = signal<string>('');
  readonly isScannerOpen = signal<boolean>(false);
  readonly selectedProduct = signal<Product | null>(null);
  readonly isCustom = signal<boolean>(false);
  customName = '';

  amount = 1;
  selectedStoreId: string | null = null;
  note = '';

  readonly earliestExpDate = signal<string | null>(null);
  readonly isSaving = signal<boolean>(false);

  get sortedStores(): Store[] {
    return [...(this.data.stores || [])].sort(compareByName);
  }

  private initialSnapshot = '';
  private subs = new Subscription();

  ngOnInit() {
    if (this.data.itemToEdit) {
      const item = this.data.itemToEdit;
      this.amount = item.amount;
      this.selectedStoreId = item.storeId || null;
      this.note = item.note || '';

      if (item.productId) {
        const prod = this.data.products.find((p) => p.id === item.productId);
        if (prod) {
          this.selectedProduct.set(prod);
        }
      } else {
        this.isCustom.set(true);
        this.customName = item.customName || item.productName || '';
      }
    } else {
      this.selectedStoreId = this.data.defaultStoreId || null;
    }

    this.initialSnapshot = this.snapshot();

    this.subs.add(
      this.dialogRef.backdropClick.subscribe(() => {
        this.requestClose();
      }),
    );

    this.subs.add(
      this.dialogRef.keydownEvents.subscribe((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.requestClose();
        }
      }),
    );
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.searchInput?.nativeElement?.focus();
    }, 50);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  private snapshot(): string {
    return JSON.stringify({
      productId: this.selectedProduct()?.id || null,
      isCustom: this.isCustom(),
      customName: this.customName.trim(),
      amount: this.amount,
      storeId: this.selectedStoreId,
      note: this.note.trim(),
    });
  }

  isDirty(): boolean {
    return this.snapshot() !== this.initialSnapshot;
  }

  readonly searchResults = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) {
      return this.data.products.slice(0, 8);
    }
    return this.data.products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcodes?.some((bc) => bc.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  });

  toggleScanner(): void {
    this.isScannerOpen.set(!this.isScannerOpen());
  }

  onBarcodeScanned(code: string): void {
    const val = code.trim();
    if (val) {
      this.searchQuery.set(val);
      const match = this.data.products.find((p) =>
        p.barcodes?.some((bc) => bc.toLowerCase() === val.toLowerCase()),
      );
      if (match) {
        this.selectProduct(match);
      }
    }
    this.isScannerOpen.set(false);
  }

  async selectProduct(p: Product) {
    this.selectedProduct.set(p);
    this.isCustom.set(false);
    this.searchQuery.set('');
    this.earliestExpDate.set(null);

    if (p.defaultStoreId && !this.selectedStoreId) {
      this.selectedStoreId = p.defaultStoreId;
    }

    try {
      const stock = await this.api.getStock();
      const matchingItems = stock
        .filter((s) => s.productId === p.id && s.bestBeforeDate)
        .sort((a, b) => (a.bestBeforeDate! > b.bestBeforeDate! ? 1 : -1));
      if (matchingItems.length > 0) {
        this.earliestExpDate.set(matchingItems[0].bestBeforeDate);
      }
    } catch {
      // Ignore background fetch error
    }
  }

  chooseCustomItem() {
    this.customName = this.searchQuery().trim();
    this.isCustom.set(true);
    this.selectedProduct.set(null);
  }

  deselectProduct() {
    this.selectedProduct.set(null);
    this.isCustom.set(false);
    this.customName = '';
    this.earliestExpDate.set(null);
  }

  incrementAmount() {
    this.amount = (this.amount || 0) + 1;
  }

  decrementAmount() {
    if (this.amount > 1) {
      this.amount -= 1;
    }
  }

  canSave(): boolean {
    if (this.selectedProduct()) return this.amount >= 1;
    if (this.isCustom()) return !!this.customName.trim() && this.amount >= 1;
    return false;
  }

  async save() {
    if (!this.canSave()) return;

    this.isSaving.set(true);
    try {
      const prod = this.selectedProduct();

      if (this.data.itemToEdit) {
        await this.api.updateShoppingItem(this.data.itemToEdit.id, {
          productId: prod ? prod.id : undefined,
          customName: !prod ? this.customName.trim() : undefined,
          amount: this.amount,
          storeId: this.selectedStoreId || null,
          note: this.note.trim() || null,
        });
      } else {
        await this.api.addShoppingItem({
          shoppingListId: this.data.shoppingListId,
          productId: prod ? prod.id : undefined,
          customName: !prod ? this.customName.trim() : undefined,
          amount: this.amount,
          storeId: this.selectedStoreId || null,
          note: this.note.trim() || null,
        });
      }

      this.dialogRef.close(true);
    } catch (err) {
      console.error('Failed to save shopping item:', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  async requestClose() {
    if (this.isDirty()) {
      const confirmRef = this.dialog.open(ConfirmModalComponent, {
        data: {
          title: 'Unsaved Changes',
          message: 'You have unsaved changes in this shopping item. Are you sure you want to discard them?',
          confirmLabel: 'Discard Changes',
          confirmVariant: 'danger',
        },
      });
      const confirmed = await firstValueFrom(confirmRef.closed);
      if (!confirmed) return;
    }
    this.dialogRef.close(false);
  }

  close(result: boolean) {
    if (result) {
      this.dialogRef.close(true);
    } else {
      this.requestClose();
    }
  }
}
