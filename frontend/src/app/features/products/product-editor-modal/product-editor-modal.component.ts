import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { CdkDragDrop, CdkDropList, CdkDrag, CdkDragHandle, moveItemInArray } from '@angular/cdk/drag-drop';
import { firstValueFrom, Subscription } from 'rxjs';
import { LucideBookOpen, LucideCamera, LucidePlus, LucideUtensils, LucideX } from '@lucide/angular';
import {
  Location,
  MealieLinkedFood,
  MealieLinkedRecipe,
  Product,
  ProductGroup,
  QuantityUnit,
  Store,
  Aisle,
} from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';
import { CollapsibleSectionComponent } from '../../../shared/components/collapsible-section/collapsible-section.component.js';
import { AutocompleteDirective, AutocompleteOption } from '../../../shared/directives/autocomplete.directive.js';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component.js';
import { BarcodeScannerComponent } from '../../../shared/components/barcode-scanner/barcode-scanner.component.js';
import { NumberStepperComponent } from '../../../shared/components/number-stepper/number-stepper.component.js';
import { MealieLinkModalComponent, MealieLinkModalResult } from '../mealie-link-modal/mealie-link-modal.component.js';

export interface ProductEditorModalData {
  product?: Product | null;
  initialName?: string;
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
    BarcodeScannerComponent,
    NumberStepperComponent,
    LucideBookOpen,
    LucideCamera,
    LucidePlus,
    LucideUtensils,
    LucideX,
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
    mealie: false,
  };

  allExpanded = signal<boolean>(false);
  isParentValid = true;

  readonly isMealieConfigured = signal<boolean>(false);
  readonly linkedFoods = signal<MealieLinkedFood[]>([]);
  readonly linkedRecipes = signal<MealieLinkedRecipe[]>([]);
  readonly selectedParentId = signal<string | null>(null);

  readonly inheritedFoods = computed(() => {
    const parentId = this.selectedParentId();
    if (!parentId || !this.data.allProducts) return [];
    const foods: MealieLinkedFood[] = [];
    const visited = new Set<string>();
    let currId: string | null | undefined = parentId;
    const productsMap = new Map<string, Product>(this.data.allProducts.map((p) => [p.id, p]));

    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const parent = productsMap.get(currId);
      if (!parent) break;
      if (parent.mealieFoods && Array.isArray(parent.mealieFoods)) {
        for (const f of parent.mealieFoods) {
          if (!foods.some((item) => item.id === f.id)) {
            foods.push(f);
          }
        }
      }
      currId = parent.parentProductId;
    }
    return foods;
  });

  readonly inheritedRecipes = computed(() => {
    const parentId = this.selectedParentId();
    if (!parentId || !this.data.allProducts) return [];
    const recipes: MealieLinkedRecipe[] = [];
    const visited = new Set<string>();
    let currId: string | null | undefined = parentId;
    const productsMap = new Map<string, Product>(this.data.allProducts.map((p) => [p.id, p]));

    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const parent = productsMap.get(currId);
      if (!parent) break;
      if (parent.mealieRecipes && Array.isArray(parent.mealieRecipes)) {
        for (const r of parent.mealieRecipes) {
          if (!recipes.some((item) => item.id === r.id)) {
            recipes.push(r);
          }
        }
      }
      currId = parent.parentProductId;
    }
    return recipes;
  });

  readonly mealieBadge = computed(() => {
    const directCount = this.linkedFoods().length + this.linkedRecipes().length;
    const inheritedCount = this.inheritedFoods().length + this.inheritedRecipes().length;
    const total = directCount + inheritedCount;
    if (total === 0) return '';
    if (inheritedCount > 0) {
      return `${directCount} linked (+${inheritedCount} inherited)`;
    }
    return `${directCount} linked`;
  });

  get selectedParentProductId(): string | null {
    return this.selectedParentId();
  }
  set selectedParentProductId(val: string | null) {
    this.selectedParentId.set(val);
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
    defaultBestBeforeDaysAfterOpen: 0,
    defaultBestBeforeDaysAfterFreezing: 0,
    defaultBestBeforeDaysAfterThawing: 0,
    minStockAmount: 0,
    treatOpenedAsOutOfStock: false,
    cannotBeFrozen: false,
    quStockId: null,
    active: true,
  };

  readonly photos = signal<PhotoItem[]>([]);
  readonly barcodes = signal<string[]>([]);
  readonly isScannerOpen = signal<boolean>(false);
  newBarcodeInput = '';
  storeConfigs: Record<string, { aisle: string; aisleOrder: number | null; averagePrice: number | null }> = {};
  readonly storeAisles = signal<Record<string, Aisle[]>>({});

  readonly isUploading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);

  ngOnInit() {
    this.initStoreConfigs();
    this.loadAisles();

    this.api
      .getMealieStatus()
      .then((st) => this.isMealieConfigured.set(st.configured))
      .catch(() => this.isMealieConfigured.set(false));

    if (this.data.product) {
      const p = this.data.product;
      const cannotBeFrozen = !!p.cannotBeFrozen;
      this.selectedParentId.set(p.parentProductId || null);
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
        defaultBestBeforeDaysAfterOpen: p.defaultBestBeforeDaysAfterOpen ?? 0,
        defaultBestBeforeDaysAfterFreezing: cannotBeFrozen ? null : (p.defaultBestBeforeDaysAfterFreezing ?? 0),
        defaultBestBeforeDaysAfterThawing: cannotBeFrozen ? null : (p.defaultBestBeforeDaysAfterThawing ?? 0),
        minStockAmount: p.minStockAmount || 0,
        treatOpenedAsOutOfStock: !!p.treatOpenedAsOutOfStock,
        cannotBeFrozen,
        quStockId: p.quStockId || null,
        active: p.active !== undefined ? !!p.active : true,
      };

      if (p.barcodes && Array.isArray(p.barcodes)) {
        this.barcodes.set([...p.barcodes]);
      }

      if (p.mealieFoods && Array.isArray(p.mealieFoods)) {
        this.linkedFoods.set([...p.mealieFoods]);
      }

      if (p.mealieRecipes && Array.isArray(p.mealieRecipes)) {
        this.linkedRecipes.set([...p.mealieRecipes]);
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
    } else if (this.data.initialName) {
      this.formProduct.name = this.data.initialName;
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
      mealieFoods: this.linkedFoods(),
      mealieRecipes: this.linkedRecipes(),
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

  private loadAisles() {
    if (!this.api.getAisles) return;
    this.api
      .getAisles()
      .then((aisles) => {
        const grouped: Record<string, Aisle[]> = {};
        for (const a of aisles) {
          if (!grouped[a.storeId]) grouped[a.storeId] = [];
          grouped[a.storeId].push(a);
        }
        this.storeAisles.set(grouped);
      })
      .catch(() => {});
  }

  onStoreAisleSelected(storeId: string, aisleName: string) {
    if (!this.storeConfigs[storeId]) return;
    this.storeConfigs[storeId].aisle = aisleName;
    const aisles = this.storeAisles()[storeId] || [];
    const matched = aisles.find((a) => a.name === aisleName);
    if (matched) {
      this.storeConfigs[storeId].aisleOrder = matched.sortOrder;
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
    this.sections.mealie = nextState;
  }

  async openLinkFoodModal(): Promise<void> {
    const inheritedIds = this.inheritedFoods().map((f) => f.id);
    const alreadyLinkedIds = [...new Set([...this.linkedFoods().map((f) => f.id), ...inheritedIds])];
    const dialogRef = this.dialog.open<MealieLinkModalResult[] | null>(MealieLinkModalComponent, {
      data: {
        mode: 'food',
        alreadyLinkedIds,
      },
    });

    const res = await firstValueFrom(dialogRef.closed);
    if (Array.isArray(res) && res.length > 0) {
      const existingIds = new Set(this.linkedFoods().map((f) => f.id));
      const additions = res
        .filter((r) => !existingIds.has(r.id))
        .map((r) => ({ id: r.id, name: r.name }));
      if (additions.length > 0) {
        this.linkedFoods.set([...this.linkedFoods(), ...additions]);
      }
    }
  }

  async openLinkRecipeModal(): Promise<void> {
    const inheritedIds = this.inheritedRecipes().map((r) => r.id);
    const alreadyLinkedIds = [...new Set([...this.linkedRecipes().map((r) => r.id), ...inheritedIds])];
    const dialogRef = this.dialog.open<MealieLinkModalResult[] | null>(MealieLinkModalComponent, {
      data: {
        mode: 'recipe',
        alreadyLinkedIds,
      },
    });

    const res = await firstValueFrom(dialogRef.closed);
    if (Array.isArray(res) && res.length > 0) {
      const existingIds = new Set(this.linkedRecipes().map((r) => r.id));
      const additions = res
        .filter((r) => !existingIds.has(r.id))
        .map((r) => ({ id: r.id, slug: r.slug || r.id, name: r.name }));
      if (additions.length > 0) {
        this.linkedRecipes.set([...this.linkedRecipes(), ...additions]);
      }
    }
  }

  removeLinkedFood(index: number): void {
    const list = [...this.linkedFoods()];
    list.splice(index, 1);
    this.linkedFoods.set(list);
  }

  removeLinkedRecipe(index: number): void {
    const list = [...this.linkedRecipes()];
    list.splice(index, 1);
    this.linkedRecipes.set(list);
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

  toggleScanner() {
    this.isScannerOpen.set(!this.isScannerOpen());
  }

  onBarcodeScanned(code: string) {
    const val = code.trim();
    if (val && !this.barcodes().includes(val)) {
      this.barcodes.set([...this.barcodes(), val]);
    }
    this.isScannerOpen.set(false);
  }

  removeBarcode(index: number) {
    const list = [...this.barcodes()];
    list.splice(index, 1);
    this.barcodes.set(list);
  }

  availableLocations(): Location[] {
    if (this.formProduct.cannotBeFrozen) {
      return (this.data.locations || []).filter((l) => !l.isFreezer);
    }
    return this.data.locations || [];
  }

  onCannotBeFrozenChange(checked: boolean): void {
    if (checked) {
      this.formProduct.defaultBestBeforeDaysAfterFreezing = null;
      this.formProduct.defaultBestBeforeDaysAfterThawing = null;
      if (this.formProduct.defaultLocationId) {
        const loc = this.data.locations?.find((l) => l.id === this.formProduct.defaultLocationId);
        if (loc?.isFreezer) {
          this.formProduct.defaultLocationId = null;
        }
      }
      if (this.formProduct.openLocationId) {
        const loc = this.data.locations?.find((l) => l.id === this.formProduct.openLocationId);
        if (loc?.isFreezer) {
          this.formProduct.openLocationId = null;
        }
      }
    }
  }

  getQuStockUnitName(): string {
    if (!this.formProduct.quStockId) return '';
    const unit = this.data.units?.find((u) => u.id === this.formProduct.quStockId);
    return unit ? unit.name : '';
  }

  async saveProduct() {
    if (!this.formProduct.name?.trim() || !this.isParentValid) return;

    this.isSaving.set(true);
    try {
      const cannotFreeze = !!this.formProduct.cannotBeFrozen;
      let defaultLocationId = this.formProduct.defaultLocationId ?? null;
      let openLocationId = this.formProduct.openLocationId ?? null;

      if (cannotFreeze) {
        if (defaultLocationId) {
          const loc = this.data.locations?.find((l) => l.id === defaultLocationId);
          if (loc?.isFreezer) defaultLocationId = null;
        }
        if (openLocationId) {
          const loc = this.data.locations?.find((l) => l.id === openLocationId);
          if (loc?.isFreezer) openLocationId = null;
        }
      }

      const payload: Partial<Product> = {
        ...this.formProduct,
        defaultLocationId,
        openLocationId,
        defaultBestBeforeDays: Number(this.formProduct.defaultBestBeforeDays) || 0,
        defaultBestBeforeDaysAfterOpen: this.formProduct.defaultBestBeforeDaysAfterOpen ? Number(this.formProduct.defaultBestBeforeDaysAfterOpen) : null,
        defaultBestBeforeDaysAfterFreezing: cannotFreeze ? null : (this.formProduct.defaultBestBeforeDaysAfterFreezing ? Number(this.formProduct.defaultBestBeforeDaysAfterFreezing) : null),
        defaultBestBeforeDaysAfterThawing: cannotFreeze ? null : (this.formProduct.defaultBestBeforeDaysAfterThawing ? Number(this.formProduct.defaultBestBeforeDaysAfterThawing) : null),
        minStockAmount: Number(this.formProduct.minStockAmount) || 0,
        barcodes: this.barcodes(),
        mealieFoods: this.linkedFoods(),
        mealieRecipes: this.linkedRecipes(),
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
