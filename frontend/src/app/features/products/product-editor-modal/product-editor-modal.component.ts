import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { CdkDragDrop, CdkDropList, CdkDrag, CdkDragHandle, moveItemInArray } from '@angular/cdk/drag-drop';
import { firstValueFrom, Subscription } from 'rxjs';
import {
  Location,
  Product,
  ProductGroup,
  QuantityUnit,
  Store,
} from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';
import { CollapsibleSectionComponent } from '../../../shared/components/collapsible-section/collapsible-section.component.js';
import { AutocompleteDirective, AutocompleteOption } from '../../../shared/directives/autocomplete.directive.js';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component.js';

export interface ProductEditorModalData {
  product?: Product | null;
  allProducts: Product[];
  productGroups: ProductGroup[];
  locations: Location[];
  units: QuantityUnit[];
  stores: Store[];
}

export interface PhotoItem {
  fileName?: string;
  url: string;
  file?: File;
  isNew?: boolean;
}

@Component({
  selector: 'app-product-editor-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CollapsibleSectionComponent,
    AutocompleteDirective,
  ],
  templateUrl: './product-editor-modal.component.html',
  styleUrl: './product-editor-modal.component.scss',
})
export class ProductEditorModalComponent implements OnInit, OnDestroy {
  readonly data = inject<ProductEditorModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly api = inject(ApiService);

  private initialSnapshot = '';
  private subs = new Subscription();

  readonly sections = {
    basic: false,
    photos: false,
    locations: false,
    dueDate: false,
    quantity: false,
    barcodes: false,
    stores: false,
  };

  allExpanded = signal<boolean>(false);
  isParentValid = true;

  get selectedParentProductId(): string | null {
    return this.formProduct.parentProductId ?? null;
  }
  set selectedParentProductId(val: string | null) {
    this.formProduct.parentProductId = val;
  }

  formProduct: Partial<Product> = {
    name: '',
    description: '',
    parentProductId: null,
    productGroupId: null,
    defaultLocationId: null,
    openLocationId: null,
    moveOnOpen: false,
    defaultStoreId: null,
    dueType: 'best_before',
    defaultBestBeforeDays: 0,
    defaultBestBeforeDaysAfterOpen: null,
    defaultBestBeforeDaysAfterFreezing: null,
    defaultBestBeforeDaysAfterThawing: null,
    minStockAmount: 0,
    treatOpenedAsOutOfStock: false,
    cannotBeFrozen: false,
    quStockId: null,
    active: true,
  };

  readonly photos = signal<PhotoItem[]>([]);
  readonly barcodes = signal<string[]>([]);
  newBarcodeInput = '';
  storeConfigs: Record<string, { aisle: string; aisleOrder: number | null; averagePrice: number | null }> = {};

  readonly isUploading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);

  ngOnInit() {
    this.initStoreConfigs();

    if (this.data.product) {
      const p = this.data.product;
      this.formProduct = {
        name: p.name,
        description: p.description || '',
        parentProductId: p.parentProductId || null,
        productGroupId: p.productGroupId || null,
        defaultLocationId: p.defaultLocationId || null,
        openLocationId: p.openLocationId || null,
        moveOnOpen: !!p.moveOnOpen,
        defaultStoreId: p.defaultStoreId || null,
        dueType: p.dueType || 'best_before',
        defaultBestBeforeDays: p.defaultBestBeforeDays || 0,
        defaultBestBeforeDaysAfterOpen: p.defaultBestBeforeDaysAfterOpen ?? null,
        defaultBestBeforeDaysAfterFreezing: p.defaultBestBeforeDaysAfterFreezing ?? null,
        defaultBestBeforeDaysAfterThawing: p.defaultBestBeforeDaysAfterThawing ?? null,
        minStockAmount: p.minStockAmount || 0,
        treatOpenedAsOutOfStock: !!p.treatOpenedAsOutOfStock,
        cannotBeFrozen: !!p.cannotBeFrozen,
        quStockId: p.quStockId || null,
        active: p.active !== undefined ? !!p.active : true,
      };

      if (p.barcodes && Array.isArray(p.barcodes)) {
        this.barcodes.set([...p.barcodes]);
      }

      if (p.pictureFileNames && Array.isArray(p.pictureFileNames)) {
        this.photos.set(
          p.pictureFileNames.map((fn) => ({
            fileName: fn,
            url: `/api/products/pictures/${fn}`,
            isNew: false,
          })),
        );
      }

      if (p.stores) {
        for (const ps of p.stores) {
          if (this.storeConfigs[ps.storeId]) {
            this.storeConfigs[ps.storeId] = {
              aisle: ps.aisle || '',
              aisleOrder: ps.aisleOrder ?? null,
              averagePrice: ps.averagePrice ?? null,
            };
          }
        }
      }
    }

    this.initialSnapshot = this.snapshot();

    this.subs.add(
      this.dialogRef.backdropClick.subscribe(() => {
        this.cancel();
      }),
    );

    this.subs.add(
      this.dialogRef.keydownEvents.subscribe((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.cancel();
        }
      }),
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  private snapshot(): string {
    return JSON.stringify({
      form: this.formProduct,
      barcodes: this.barcodes(),
      photos: this.photos().map((p) => ({ fileName: p.fileName, isNew: p.isNew })),
      storeConfigs: this.storeConfigs,
    });
  }

  isDirty(): boolean {
    return this.snapshot() !== this.initialSnapshot;
  }

  private initStoreConfigs() {
    this.storeConfigs = {};
    for (const s of this.data.stores) {
      this.storeConfigs[s.id] = { aisle: '', aisleOrder: null, averagePrice: null };
    }
  }

  candidateParents(): AutocompleteOption[] {
    const currentId = this.data.product?.id;
    let list = this.data.allProducts;
    if (currentId) {
      list = list.filter((p) => p.id !== currentId && !p.ancestors?.some((a) => a.id === currentId));
    }
    return list.map((p) => ({
      id: p.id,
      label: p.hierarchyPath || p.name,
      subLabel: p.hierarchyPath ? p.name : undefined,
    }));
  }

  toggleAllSections() {
    const nextState = !this.allExpanded();
    this.allExpanded.set(nextState);
    this.sections.basic = nextState;
    this.sections.photos = nextState;
    this.sections.locations = nextState;
    this.sections.dueDate = nextState;
    this.sections.quantity = nextState;
    this.sections.barcodes = nextState;
    this.sections.stores = nextState;
  }

  onPhotoDrop(event: CdkDragDrop<PhotoItem[]>) {
    const list = [...this.photos()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.photos.set(list);
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const added: PhotoItem[] = [];
    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];
      added.push({
        file,
        url: URL.createObjectURL(file),
        isNew: true,
      });
    }

    this.photos.set([...this.photos(), ...added]);
    input.value = '';
  }

  removePhoto(index: number) {
    const list = [...this.photos()];
    list.splice(index, 1);
    this.photos.set(list);
  }

  addBarcode() {
    const val = this.newBarcodeInput.trim();
    if (!val) return;
    if (!this.barcodes().includes(val)) {
      this.barcodes.set([...this.barcodes(), val]);
    }
    this.newBarcodeInput = '';
  }

  removeBarcode(index: number) {
    const list = [...this.barcodes()];
    list.splice(index, 1);
    this.barcodes.set(list);
  }

  async saveProduct() {
    if (!this.formProduct.name?.trim() || !this.isParentValid) return;

    this.isSaving.set(true);
    try {
      const payload: Partial<Product> = {
        ...this.formProduct,
        barcodes: this.barcodes(),
      };

      let productId = this.data.product?.id;

      if (productId) {
        await this.api.updateProduct(productId, payload);
      } else {
        const created = await this.api.createProduct(payload);
        productId = created.id;
      }

      if (productId) {
        const currentPhotoItems = this.photos();

        // 1. Upload newly added files
        for (const item of currentPhotoItems) {
          if (item.isNew && item.file) {
            const res = await this.api.uploadProductPicture(productId, item.file);
            item.fileName = res.fileName;
            item.isNew = false;
          }
        }

        // 2. Identify and delete photos that were removed
        if (this.data.product?.pictureFileNames) {
          const survivingFileNames = new Set(
            currentPhotoItems.map((p) => p.fileName).filter((fn): fn is string => !!fn),
          );
          for (const oldFn of this.data.product.pictureFileNames) {
            if (!survivingFileNames.has(oldFn)) {
              await this.api.deleteProductPicture(productId, oldFn);
            }
          }
        }

        // 3. Update order of surviving photos
        const finalFileNames = currentPhotoItems
          .map((p) => p.fileName)
          .filter((fn): fn is string => !!fn);
        if (finalFileNames.length > 0) {
          await this.api.reorderProductPictures(productId, finalFileNames);
        }

        // 4. Save store configurations
        for (const [storeId, conf] of Object.entries(this.storeConfigs)) {
          if (conf.aisle.trim() || conf.averagePrice !== null || conf.aisleOrder !== null) {
            await this.api.setProductStore(productId, storeId, {
              aisle: conf.aisle.trim() || null,
              aisleOrder: conf.aisleOrder,
              averagePrice: conf.averagePrice,
            });
          }
        }

        const finalProduct = await this.api.getProduct(productId);
        this.dialogRef.close({ product: finalProduct, isNew: !this.data.product });
      } else {
        this.dialogRef.close(true);
      }
    } catch (err) {
      console.error('Error saving product:', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  async cancel() {
    if (this.isDirty()) {
      const confirmRef = this.dialog.open(ConfirmModalComponent, {
        data: {
          title: 'Unsaved Changes',
          message: 'You have unsaved changes in this product. Are you sure you want to discard them?',
          confirmLabel: 'Discard Changes',
          confirmVariant: 'danger',
        },
      });
      const confirmed = await firstValueFrom(confirmRef.closed);
      if (!confirmed) return;
    }
    this.dialogRef.close(false);
  }
}
