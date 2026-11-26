import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { CdkDragDrop, CdkDropList, CdkDrag, CdkDragHandle, moveItemInArray } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import { LucideBookOpen, LucideCamera, LucideChevronsDownUp, LucideChevronsUpDown, LucidePlus, LucideUtensils, LucideX } from '@lucide/angular';
import {
  Aisle,
  Location,
  MealieLinkedFood,
  MealieLinkedRecipe,
  Product,
  ProductCustomField,
  ProductGroup,
  QuantityUnit,
  Store,
} from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';
import { compareByName, compareByNumericOrder } from '../../../core/sorting.utils.js';
import { CollapsibleSectionComponent } from '../../../shared/components/collapsible-section/collapsible-section.component.js';
import { AutocompleteDirective, AutocompleteOption } from '../../../shared/directives/autocomplete.directive.js';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component.js';
import { BarcodeScannerComponent } from '../../../shared/components/barcode-scanner/barcode-scanner.component.js';
import { NumberStepperComponent } from '../../../shared/components/number-stepper/number-stepper.component.js';
import { MealieLinkModalComponent, MealieLinkModalResult } from '../mealie-link-modal/mealie-link-modal.component.js';

export interface ProductEditorModalData {
  product?: Product | null;
  initialName?: string;
  initialBarcode?: string;
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
  selector: 'app-product-detail-view',
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
    LucideChevronsDownUp,
    LucideChevronsUpDown,
    LucidePlus,
    LucideUtensils,
    LucideX,
  ],
  templateUrl: './product-detail-view.component.html',
  styleUrl: './product-detail-view.component.scss',
})
export class ProductDetailViewComponent implements OnInit {
  private readonly dialog = inject(Dialog);
  private readonly api = inject(ApiService);

  readonly data = input.required<ProductEditorModalData>();

  readonly saved = output<{ product: Product; isNew: boolean }>();
  readonly cancelled = output<void>();

  private initialSnapshot = '';

  readonly sections = {
    basic: false,
    photos: false,
    locations: false,
    dueDate: false,
    quantity: false,
    barcodes: false,
    stores: false,
    mealie: false,
    customFields: false,
  };

  allExpanded = signal<boolean>(false);
  isParentValid = true;

  readonly isMealieConfigured = signal<boolean>(false);
  readonly linkedFoods = signal<MealieLinkedFood[]>([]);
  readonly linkedRecipes = signal<MealieLinkedRecipe[]>([]);
  readonly selectedParentId = signal<string | null>(null);

  readonly inheritedFoods = computed(() => {
    const parentId = this.selectedParentId();
    const allProducts = this.data().allProducts;
    if (!parentId || !allProducts) return [];
    const foods: MealieLinkedFood[] = [];
    const visited = new Set<string>();
    let currId: string | null | undefined = parentId;
    const productsMap = new Map<string, Product>(allProducts.map((p) => [p.id, p]));

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
    const allProducts = this.data().allProducts;
    if (!parentId || !allProducts) return [];
    const recipes: MealieLinkedRecipe[] = [];
    const visited = new Set<string>();
    let currId: string | null | undefined = parentId;
    const productsMap = new Map<string, Product>(allProducts.map((p) => [p.id, p]));

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
  readonly customFieldDefinitions = signal<ProductCustomField[]>([]);
  customFieldValues: Record<string, string | number | boolean | null> = {};

  readonly customFieldsBadge = computed(() => {
    const count = this.customFieldDefinitions().length;
    return count > 0 ? `${count}` : '';
  });

  readonly isUploading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);

  ngOnInit() {
    this.initFromData();
    this.loadAisles();
    this.loadCustomFields();

    if (typeof this.api.getMealieStatus === 'function') {
      this.api
        .getMealieStatus()
        .then((st) => this.isMealieConfigured.set(st.configured))
        .catch(() => this.isMealieConfigured.set(false));
    }
  }

  initFromData(): void {
    const modalData = this.data();
    this.initStoreConfigs();

    if (modalData.product) {
      const p = modalData.product;
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

      this.barcodes.set(p.barcodes && Array.isArray(p.barcodes) ? [...p.barcodes] : []);
      this.linkedFoods.set(p.mealieFoods && Array.isArray(p.mealieFoods) ? [...p.mealieFoods] : []);
      this.linkedRecipes.set(p.mealieRecipes && Array.isArray(p.mealieRecipes) ? [...p.mealieRecipes] : []);
      this.photos.set(
        p.pictureFileNames && Array.isArray(p.pictureFileNames)
          ? p.pictureFileNames.map((fn) => ({
              fileName: fn,
              url: `/api/products/pictures/${fn}`,
              isNew: false,
            }))
          : [],
      );

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
      } else if (typeof this.api.getProductStores === 'function') {
        this.api
          .getProductStores(p.id)
          .then((storesList) => {
            for (const ps of storesList) {
              if (this.storeConfigs[ps.storeId]) {
                this.storeConfigs[ps.storeId] = {
                  aisle: ps.aisle || '',
                  aisleOrder: ps.aisleOrder ?? null,
                  averagePrice: ps.averagePrice ?? null,
                };
              }
            }
            this.initialSnapshot = this.snapshot();
          })
          .catch(() => {});
      }
    } else {
      this.selectedParentId.set(null);
      this.formProduct = {
        name: modalData.initialName || '',
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
      const initialBarcode = modalData.initialBarcode?.trim();
      this.barcodes.set(initialBarcode ? [initialBarcode] : []);
      this.linkedFoods.set([]);
      this.linkedRecipes.set([]);
      this.photos.set([]);
    }

    this.customFieldValues = { ...(modalData.product?.customFields || {}) };
    this.applyCustomFieldDefaults();
    this.initialSnapshot = this.snapshot();
  }

  private snapshot(): string {
    return JSON.stringify({
      form: this.formProduct,
      barcodes: this.barcodes(),
      photos: this.photos().map((p) => ({ fileName: p.fileName, isNew: p.isNew })),
      storeConfigs: this.storeConfigs,
      mealieFoods: this.linkedFoods(),
      mealieRecipes: this.linkedRecipes(),
      customFields: this.customFieldValues,
    });
  }

  isDirty(): boolean {
    return this.snapshot() !== this.initialSnapshot;
  }

  private initStoreConfigs() {
    this.storeConfigs = {};
    for (const s of this.data().stores) {
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
        for (const storeId of Object.keys(grouped)) {
          grouped[storeId].sort(compareByNumericOrder);
        }
        this.storeAisles.set(grouped);
      })
      .catch(() => {});
  }

  private loadCustomFields(): void {
    if (typeof this.api.getProductCustomFields !== 'function') return;
    this.api
      .getProductCustomFields()
      .then((fields) => {
        const sorted = [...fields].sort(compareByNumericOrder);
        this.customFieldDefinitions.set(sorted);
        const wasClean = !this.isDirty();
        this.applyCustomFieldDefaults();
        if (wasClean) {
          this.initialSnapshot = this.snapshot();
        }
      })
      .catch(() => {});
  }

  private applyCustomFieldDefaults(): void {
    const defs = this.customFieldDefinitions();
    if (defs.length === 0) return;

    const next = { ...this.customFieldValues };
    for (const field of defs) {
      if (next[field.id] !== undefined) continue;
      if (field.defaultValue !== null && field.defaultValue !== '') {
        if (field.type === 'boolean') {
          next[field.id] = field.defaultValue === 'true';
        } else if (field.type === 'int') {
          const parsed = Number.parseInt(field.defaultValue, 10);
          next[field.id] = Number.isNaN(parsed) ? null : parsed;
        } else if (field.type === 'double') {
          const parsed = Number.parseFloat(field.defaultValue);
          next[field.id] = Number.isNaN(parsed) ? null : parsed;
        } else {
          next[field.id] = field.defaultValue;
        }
      } else {
        next[field.id] = field.type === 'boolean' ? false : null;
      }
    }
    this.customFieldValues = next;
  }

  private buildCustomFieldsPayload(): Record<string, string | number | boolean | null> {
    const result: Record<string, string | number | boolean | null> = {};
    const defs = this.customFieldDefinitions();
    for (const field of defs) {
      const raw = this.customFieldValues[field.id];
      if (field.type === 'boolean') {
        result[field.id] = Boolean(raw);
      } else if (field.type === 'int') {
        if (raw === null || raw === undefined || raw === '') {
          result[field.id] = null;
        } else {
          const parsed = Number.parseInt(String(raw), 10);
          result[field.id] = Number.isNaN(parsed) ? null : parsed;
        }
      } else if (field.type === 'double') {
        if (raw === null || raw === undefined || raw === '') {
          result[field.id] = null;
        } else {
          const parsed = Number.parseFloat(String(raw));
          result[field.id] = Number.isNaN(parsed) ? null : parsed;
        }
      } else {
        result[field.id] = raw !== null && raw !== undefined && String(raw).trim() !== '' ? String(raw) : null;
      }
    }
    return result;
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

  readonly candidateParents = computed<AutocompleteOption[]>(() => {
    const currentId = this.data().product?.id;
    let list = this.data().allProducts || [];
    if (currentId) {
      list = list.filter((p) => p.id !== currentId && !p.ancestors?.some((a) => a.id === currentId));
    }
    return list.map((p) => ({
      id: p.id,
      label: p.hierarchyPath || p.name,
      subLabel: p.hierarchyPath ? p.name : undefined,
    }));
  });

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
    this.sections.customFields = nextState;
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
    const inputEl = event.target as HTMLInputElement;
    if (!inputEl.files || inputEl.files.length === 0) return;

    const added: PhotoItem[] = [];
    for (let i = 0; i < inputEl.files.length; i++) {
      const file = inputEl.files[i];
      added.push({
        file,
        url: URL.createObjectURL(file),
        isNew: true,
      });
    }

    this.photos.set([...this.photos(), ...added]);
    inputEl.value = '';
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

  sortedProductGroups(): ProductGroup[] {
    return [...(this.data().productGroups || [])].sort(compareByName);
  }

  sortedStores(): Store[] {
    return [...(this.data().stores || [])].sort(compareByName);
  }

  sortedUnits(): QuantityUnit[] {
    return [...(this.data().units || [])].sort(compareByName);
  }

  availableLocations(): Location[] {
    const locations = this.data().locations || [];
    const base = this.formProduct.cannotBeFrozen
      ? locations.filter((l) => !l.isFreezer)
      : [...locations];
    return base.sort(compareByName);
  }

  onCannotBeFrozenChange(checked: boolean): void {
    if (checked) {
      this.formProduct.defaultBestBeforeDaysAfterFreezing = null;
      this.formProduct.defaultBestBeforeDaysAfterThawing = null;
      if (this.formProduct.defaultLocationId) {
        const loc = this.data().locations?.find((l) => l.id === this.formProduct.defaultLocationId);
        if (loc?.isFreezer) {
          this.formProduct.defaultLocationId = null;
        }
      }
      if (this.formProduct.openLocationId) {
        const loc = this.data().locations?.find((l) => l.id === this.formProduct.openLocationId);
        if (loc?.isFreezer) {
          this.formProduct.openLocationId = null;
        }
      }
    }
  }

  getQuStockUnitName(): string {
    if (!this.formProduct.quStockId) return '';
    const unit = this.data().units?.find((u) => u.id === this.formProduct.quStockId);
    return unit ? unit.name : '';
  }

  async saveProduct() {
    if (!this.formProduct.name?.trim() || !this.isParentValid) return;

    this.isSaving.set(true);
    try {
      const modalData = this.data();
      const cannotFreeze = !!this.formProduct.cannotBeFrozen;
      let defaultLocationId = this.formProduct.defaultLocationId ?? null;
      let openLocationId = this.formProduct.openLocationId ?? null;

      if (cannotFreeze) {
        if (defaultLocationId) {
          const loc = modalData.locations?.find((l) => l.id === defaultLocationId);
          if (loc?.isFreezer) defaultLocationId = null;
        }
        if (openLocationId) {
          const loc = modalData.locations?.find((l) => l.id === openLocationId);
          if (loc?.isFreezer) openLocationId = null;
        }
      }

      const payload: Partial<Product> = {
        ...this.formProduct,
        defaultLocationId,
        openLocationId,
        defaultBestBeforeDays: Number(this.formProduct.defaultBestBeforeDays) || 0,
        defaultBestBeforeDaysAfterOpen: this.formProduct.defaultBestBeforeDaysAfterOpen
          ? Number(this.formProduct.defaultBestBeforeDaysAfterOpen)
          : null,
        defaultBestBeforeDaysAfterFreezing: cannotFreeze
          ? null
          : this.formProduct.defaultBestBeforeDaysAfterFreezing
            ? Number(this.formProduct.defaultBestBeforeDaysAfterFreezing)
            : null,
        defaultBestBeforeDaysAfterThawing: cannotFreeze
          ? null
          : this.formProduct.defaultBestBeforeDaysAfterThawing
            ? Number(this.formProduct.defaultBestBeforeDaysAfterThawing)
            : null,
        minStockAmount: Number(this.formProduct.minStockAmount) || 0,
        barcodes: this.barcodes(),
        mealieFoods: this.linkedFoods(),
        mealieRecipes: this.linkedRecipes(),
        customFields: this.buildCustomFieldsPayload(),
      };

      let productId = modalData.product?.id;

      if (productId) {
        await this.api.updateProduct(productId, payload);
      } else {
        const created = await this.api.createProduct(payload);
        productId = created.id;
      }

      if (productId) {
        const currentPhotoItems = this.photos();
        const hasNewPhotos = currentPhotoItems.some((item) => item.isNew && item.file);
        if (!modalData.product?.id && hasNewPhotos && typeof this.api.syncNow === 'function') {
          await this.api.syncNow().catch(() => false);
        }

        // 1. Upload newly added files
        for (const item of currentPhotoItems) {
          if (item.isNew && item.file) {
            const res = await this.api.uploadProductPicture(productId, item.file);
            item.fileName = res.fileName;
            item.isNew = false;
          }
        }

        // 2. Identify and delete photos that were removed
        if (modalData.product?.pictureFileNames) {
          const survivingFileNames = new Set(
            currentPhotoItems.map((p) => p.fileName).filter((fn): fn is string => !!fn),
          );
          for (const oldFn of modalData.product.pictureFileNames) {
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
        const previousStoreIds = new Set((modalData.product?.stores || []).map((s) => s.storeId));
        for (const [storeId, conf] of Object.entries(this.storeConfigs)) {
          if (conf.aisle.trim() || conf.averagePrice !== null || conf.aisleOrder !== null) {
            await this.api.setProductStore(productId, storeId, {
              aisle: conf.aisle.trim() || null,
              aisleOrder: conf.aisleOrder,
              averagePrice: conf.averagePrice,
            });
          } else if (previousStoreIds.has(storeId)) {
            await this.api.removeProductStore(productId, storeId);
          }
        }

        const finalProduct = await this.api.getProduct(productId);
        this.saved.emit({ product: finalProduct, isNew: !modalData.product });
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
      this.initFromData();
    }
    this.cancelled.emit();
  }
}
