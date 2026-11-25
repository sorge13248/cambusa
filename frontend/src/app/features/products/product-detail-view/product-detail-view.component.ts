import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { CdkDragDrop, CdkDropList, CdkDrag, CdkDragHandle, moveItemInArray } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import { LucideBookOpen, LucideCamera, LucideChevronsDownUp, LucideChevronsUpDown, LucidePencil, LucidePlus, LucideUtensils, LucideX } from '@lucide/angular';
import {
  Aisle,
  Location,
  MealieLinkedFood,
  MealieLinkedRecipe,
  Product,
  ProductGroup,
  ProductMemberRatingDto,
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
import { StarRatingComponent } from '../../../shared/components/star-rating/star-rating.component.js';
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
    StarRatingComponent,
    LucideBookOpen,
    LucideCamera,
    LucideChevronsDownUp,
    LucideChevronsUpDown,
    LucidePencil,
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

  readonly mode = input<'info' | 'edit'>('edit');
  readonly data = input.required<ProductEditorModalData>();
  readonly showEditSwitch = input<boolean>(false);

  readonly saved = output<{ product: Product; isNew: boolean }>();
  readonly cancelled = output<void>();
  readonly closeRequested = output<void>();
  readonly editRequested = output<void>();

  readonly isInfoMode = computed(() => this.mode() === 'info');

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
    ratings: false,
  };

  allExpanded = signal<boolean>(false);
  isParentValid = true;

  readonly isMealieConfigured = signal<boolean>(false);
  readonly linkedFoods = signal<MealieLinkedFood[]>([]);
  readonly linkedRecipes = signal<MealieLinkedRecipe[]>([]);
  readonly selectedParentId = signal<string | null>(null);

  // Ratings state
  readonly myRating = signal<number | null>(null);
  readonly householdMemberCount = signal<number>(1);
  readonly otherMembersRatings = signal<ProductMemberRatingDto[]>([]);
  readonly isLoadingRatings = signal<boolean>(false);
  readonly isSavingRating = signal<boolean>(false);
  readonly ratingStatusText = signal<string | null>(null);

  readonly showOtherMembersRatings = computed(
    () => this.isInfoMode() && this.householdMemberCount() > 1 && this.otherMembersRatings().length > 0,
  );

  readonly otherRatingsBadge = computed(() => {
    const others = this.otherMembersRatings();
    if (others.length === 0) return '';
    const ratedCount = others.filter((m) => m.rating !== null).length;
    return `${ratedCount}/${others.length} rated`;
  });

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

  readonly isUploading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);

  ngOnInit() {
    this.initFromData();
    this.loadAisles();

    if (typeof this.api.getMealieStatus === 'function') {
      this.api
        .getMealieStatus()
        .then((st) => this.isMealieConfigured.set(st.configured))
        .catch(() => this.isMealieConfigured.set(false));
    }

    if (this.data().product?.id) {
      this.loadRatings(this.data().product!.id);
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

    this.initialSnapshot = this.snapshot();
  }

  private async loadRatings(productId: string): Promise<void> {
    if (typeof this.api.getProductRatings !== 'function') return;
    this.isLoadingRatings.set(true);
    try {
      const res = await this.api.getProductRatings(productId);
      this.myRating.set(res.myRating);
      this.householdMemberCount.set(res.memberCount);
      this.otherMembersRatings.set(res.otherMembersRatings ?? []);
    } catch {
      // Ignore if ratings cannot be fetched
    } finally {
      this.isLoadingRatings.set(false);
    }
  }

  async onMyRatingChange(rating: number | null): Promise<void> {
    const product = this.data().product;
    if (!product?.id || typeof this.api.setProductRating !== 'function') return;

    const previous = this.myRating();
    this.myRating.set(rating);
    this.isSavingRating.set(true);
    this.ratingStatusText.set(null);

    try {
      await this.api.setProductRating(product.id, rating);
    } catch {
      this.myRating.set(previous);
      this.ratingStatusText.set('Failed to save');
    } finally {
      this.isSavingRating.set(false);
    }
  }

  getMemberInitials(displayName: string): string {
    const parts = (displayName || '').trim().split(/\s+/);
    return (
      parts
        .map((p) => p.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'U'
    );
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
    if (this.isInfoMode()) return false;
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

  onStoreAisleSelected(storeId: string, aisleName: string) {
    if (this.isInfoMode() || !this.storeConfigs[storeId]) return;
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
    if (this.showOtherMembersRatings()) {
      this.sections.ratings = nextState;
    }
  }

  async openLinkFoodModal(): Promise<void> {
    if (this.isInfoMode()) return;
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
    if (this.isInfoMode()) return;
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
    if (this.isInfoMode()) return;
    const list = [...this.linkedFoods()];
    list.splice(index, 1);
    this.linkedFoods.set(list);
  }

  removeLinkedRecipe(index: number): void {
    if (this.isInfoMode()) return;
    const list = [...this.linkedRecipes()];
    list.splice(index, 1);
    this.linkedRecipes.set(list);
  }

  onPhotoDrop(event: CdkDragDrop<PhotoItem[]>) {
    if (this.isInfoMode()) return;
    const list = [...this.photos()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.photos.set(list);
  }

  onFilesSelected(event: Event) {
    if (this.isInfoMode()) return;
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
    if (this.isInfoMode()) return;
    const list = [...this.photos()];
    list.splice(index, 1);
    this.photos.set(list);
  }

  addBarcode() {
    if (this.isInfoMode()) return;
    const val = this.newBarcodeInput.trim();
    if (!val) return;
    if (!this.barcodes().includes(val)) {
      this.barcodes.set([...this.barcodes(), val]);
    }
    this.newBarcodeInput = '';
  }

  toggleScanner() {
    if (this.isInfoMode()) return;
    this.isScannerOpen.set(!this.isScannerOpen());
  }

  onBarcodeScanned(code: string) {
    if (this.isInfoMode()) return;
    const val = code.trim();
    if (val && !this.barcodes().includes(val)) {
      this.barcodes.set([...this.barcodes(), val]);
    }
    this.isScannerOpen.set(false);
  }

  removeBarcode(index: number) {
    if (this.isInfoMode()) return;
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
    if (this.isInfoMode()) return;
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
    if (this.isInfoMode()) return;
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
        this.saved.emit({ product: finalProduct, isNew: !modalData.product });
      }
    } catch (err) {
      console.error('Error saving product:', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  async cancel() {
    if (this.isInfoMode()) {
      this.closeRequested.emit();
      return;
    }

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

  requestEditMode(): void {
    this.editRequested.emit();
  }
}
