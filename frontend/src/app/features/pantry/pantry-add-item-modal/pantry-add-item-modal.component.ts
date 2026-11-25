import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, computed, inject, Injector, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom, Subscription } from 'rxjs';
import { LucideCamera, LucideSearch, LucideX } from '@lucide/angular';
import { Location, Product, ProductGroup, QuantityUnit, StockItem, Store } from '../../../core/models.js';
import { AutocompleteDirective, AutocompleteOption } from '../../../shared/directives/autocomplete.directive.js';
import { StockPurchaseFormComponent } from '../stock-purchase-form/stock-purchase-form.component.js';
import { ProductEditorModalComponent } from '../../products/product-editor-modal/product-editor-modal.component.js';
import { BarcodeScannerComponent } from '../../../shared/components/barcode-scanner/barcode-scanner.component.js';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component.js';
import { ApiService } from '../../../core/api.service.js';

export interface PantryAddItemModalData {
  products?: Product[];
  locations?: Location[];
  stores?: Store[];
  units?: QuantityUnit[];
  preselectedProductId?: string;
  productGroups?: ProductGroup[];
  quickPurchaseMode?: boolean;
  startWithScanner?: boolean;
}

@Component({
  selector: 'app-pantry-add-item-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AutocompleteDirective,
    StockPurchaseFormComponent,
    BarcodeScannerComponent,
    LucideCamera,
    LucideSearch,
    LucideX,
  ],
  templateUrl: './pantry-add-item-modal.component.html',
  styleUrl: './pantry-add-item-modal.component.scss',
})
export class PantryAddItemModalComponent implements OnInit, OnDestroy {
  readonly data = inject<PantryAddItemModalData>(DIALOG_DATA, { optional: true });
  private readonly dialogRef = inject(DialogRef);
  private readonly injector = inject(Injector);
  private readonly api = inject(ApiService);
  private subs = new Subscription();

  @ViewChild('productInput') productInputElement?: ElementRef<HTMLInputElement>;

  readonly extraProducts = signal<Product[]>([]);
  readonly extraLocations = signal<Location[]>([]);
  readonly extraStores = signal<Store[]>([]);
  readonly extraUnits = signal<QuantityUnit[]>([]);
  readonly extraProductGroups = signal<ProductGroup[]>([]);
  readonly searchInputText = signal<string>('');
  readonly isScannerOpen = signal<boolean>(false);
  readonly pendingScannedBarcode = signal<string | null>(null);
  readonly selectedProductId = signal<string | null>(this.data?.preselectedProductId || null);
  isProductValid = true;

  readonly activeProducts = computed(() => {
    const list = [...(this.data?.products || []), ...this.extraProducts()];
    const map = new Map<string, Product>();
    for (const p of list) {
      if (p.active !== false) {
        map.set(p.id, p);
      }
    }
    return Array.from(map.values());
  });

  readonly locations = computed(() => this.data?.locations ?? this.extraLocations());
  readonly stores = computed(() => this.data?.stores ?? this.extraStores());
  readonly units = computed(() => this.data?.units ?? this.extraUnits());
  readonly productGroups = computed(() => this.data?.productGroups ?? this.extraProductGroups());

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
    if (!this.data?.products?.length) {
      this.api.getProducts().then((prods: Product[]) => this.extraProducts.set(prods));
    }
    if (this.data?.locations === undefined) {
      this.api.getLocations().then((locs: Location[]) => this.extraLocations.set(locs));
    }
    if (this.data?.stores === undefined) {
      this.api.getStores().then((stores: Store[]) => this.extraStores.set(stores));
    }
    if (this.data?.units === undefined) {
      this.api.getUnits().then((units: QuantityUnit[]) => this.extraUnits.set(units));
    }
    if (this.data?.productGroups === undefined) {
      this.api.getProductGroups().then((groups: ProductGroup[]) => this.extraProductGroups.set(groups));
    }
    if (this.data?.startWithScanner) {
      this.isScannerOpen.set(true);
    }

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

  toggleScanner(): void {
    this.isScannerOpen.set(!this.isScannerOpen());
  }

  onBarcodeScanned(code: string): void {
    const val = code.trim();
    if (val) {
      const match = this.activeProducts().find((p) =>
        p.barcodes?.some((bc) => bc.toLowerCase() === val.toLowerCase()),
      );
      if (match) {
        this.pendingScannedBarcode.set(null);
        this.selectedProductId.set(match.id);
        this.isProductValid = true;
      } else {
        this.searchInputText.set(val);
        if (this.data?.quickPurchaseMode) {
          this.pendingScannedBarcode.set(val);
        }
      }
    }
    this.isScannerOpen.set(false);
  }

  async onProductSelected(id: string | null): Promise<void> {
    this.selectedProductId.set(id);
    if (!id) {
      return;
    }
    this.isProductValid = true;
    this.isScannerOpen.set(false);

    const barcode = this.pendingScannedBarcode();
    if (!this.data?.quickPurchaseMode || !barcode) {
      return;
    }

    this.pendingScannedBarcode.set(null);
    const product = this.activeProducts().find((p) => p.id === id);
    if (!product) {
      return;
    }

    const alreadyAssigned = product.barcodes?.some(
      (bc) => bc.toLowerCase() === barcode.toLowerCase(),
    );
    if (alreadyAssigned) {
      return;
    }

    const dialog = this.injector.get(Dialog);
    const confirmRef = dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Save Barcode to Product?',
        message: `Barcode "${barcode}" is not registered in the system. Do you want to save it for "${product.name}"?`,
        confirmLabel: 'Save Barcode',
        cancelLabel: 'No, Skip',
        confirmVariant: 'primary',
        showCancel: true,
      },
    });

    const confirmed = await firstValueFrom(confirmRef.closed);
    if (confirmed) {
      const updatedBarcodes = [...(product.barcodes || []), barcode];
      const updated = await this.api.updateProduct(product.id, { barcodes: updatedBarcodes });
      this.extraProducts.update((list) => {
        const idx = list.findIndex((p) => p.id === updated.id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = updated;
          return next;
        }
        return [...list, updated];
      });
    }
  }

  clearSelectedProduct(input?: HTMLInputElement): void {
    if (input) {
      input.value = '';
    }
    this.selectedProductId.set(null);
    this.searchInputText.set('');
    this.isProductValid = true;
  }

  async openCreateProductModal(name?: string): Promise<void> {
    this.isScannerOpen.set(false);
    const initialBarcode = this.pendingScannedBarcode()?.trim() || undefined;
    const rawName = (name || this.searchInputText()).trim();
    const initialName = initialBarcode && rawName === initialBarcode ? '' : rawName;
    const dialog = this.injector.get(Dialog);
    const ref = dialog.open(ProductEditorModalComponent, {
      disableClose: true,
      data: {
        product: null,
        initialName,
        initialBarcode,
        allProducts: this.activeProducts(),
        productGroups: this.productGroups(),
        locations: this.locations(),
        units: this.units(),
        stores: this.stores(),
      },
    });

    const res: any = await firstValueFrom(ref.closed);
    if (res && res.product) {
      const created: Product = res.product;
      this.pendingScannedBarcode.set(null);
      this.extraProducts.update((list) => [...list, created]);
      this.selectedProductId.set(created.id);
      this.isProductValid = true;
      this.searchInputText.set(created.name);
    }
  }

  onPurchaseSuccess(item: StockItem): void {
    if (this.data?.quickPurchaseMode) {
      this.pendingScannedBarcode.set(null);
      this.selectedProductId.set(null);
      this.searchInputText.set('');
      if (this.productInputElement) {
        this.productInputElement.nativeElement.value = '';
      }
      this.isProductValid = true;
      this.isScannerOpen.set(true);
    } else {
      this.dialogRef.close({ refreshed: true, stockItem: item });
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
