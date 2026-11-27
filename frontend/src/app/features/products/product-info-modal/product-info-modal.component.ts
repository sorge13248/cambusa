import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import {
  LucideArchive,
  LucideBookOpen,
  LucideChevronRight,
  LucideClock,
  LucideFolderTree,
  LucideLayers,
  LucideMapPin,
  LucideNetwork,
  LucidePackage,
  LucidePencil,
  LucideScale,
  LucideShoppingCart,
  LucideSlidersHorizontal,
  LucideSnowflake,
  LucideStore,
  LucideUtensils,
  LucideX,
} from '@lucide/angular';
import {
  Location,
  MealieLinkedFood,
  MealieLinkedRecipe,
  Product,
  ProductCustomField,
  ProductMemberRatingDto,
  ProductStore,
} from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';
import { compareByNumericOrder } from '../../../core/sorting.utils.js';
import { CollapsibleSectionComponent } from '../../../shared/components/collapsible-section/collapsible-section.component.js';
import { StarRatingComponent } from '../../../shared/components/star-rating/star-rating.component.js';
import {
  PhotoItem,
  ProductDetailViewComponent,
  ProductEditorModalData,
} from '../product-detail-view/product-detail-view.component.js';
import { ProductStockModalComponent } from '../product-stock-modal/product-stock-modal.component.js';
import { ShoppingAddModalComponent } from '../../shopping/shopping-add-modal/shopping-add-modal.component.js';

export type ProductInfoModalData = ProductEditorModalData;

export interface ConfiguredStoreInfo {
  storeId: string;
  storeName: string;
  aisle: string | null;
  aisleOrder: number | null;
  averagePrice: number | null;
}

@Component({
  selector: 'app-product-info-modal',
  standalone: true,
  imports: [
    CommonModule,
    ProductDetailViewComponent,
    CollapsibleSectionComponent,
    StarRatingComponent,
    LucideArchive,
    LucideBookOpen,
    LucideChevronRight,
    LucideClock,
    LucideFolderTree,
    LucideLayers,
    LucideMapPin,
    LucideNetwork,
    LucidePackage,
    LucidePencil,
    LucideScale,
    LucideShoppingCart,
    LucideSlidersHorizontal,
    LucideSnowflake,
    LucideStore,
    LucideUtensils,
    LucideX,
  ],
  templateUrl: './product-info-modal.component.html',
  styleUrl: './product-info-modal.component.scss',
})
export class ProductInfoModalComponent implements OnInit, OnDestroy {
  private readonly rawData = inject<ProductInfoModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  readonly detailView = viewChild(ProductDetailViewComponent);

  readonly mode = signal<'info' | 'edit'>('info');
  readonly modalData = signal<ProductInfoModalData>(this.rawData);
  private latestSavedResult: { product: Product; isNew: boolean } | null = null;

  private subs = new Subscription();

  // Gallery state
  readonly activePhotoIndex = signal<number>(0);

  readonly customFieldsCollapseThreshold = 4;

  // Minor collapsible sections (collapsed by default)
  readonly minorSections = {
    barcodes: false,
    stores: false,
    mealie: false,
    customFields: false,
    ratings: false,
  };

  // Async metadata state
  readonly isMealieConfigured = signal<boolean>(false);
  readonly productStores = signal<ProductStore[]>([]);
  readonly customFieldDefinitions = signal<ProductCustomField[]>([]);
  readonly myRating = signal<number | null>(null);
  readonly householdMemberCount = signal<number>(1);
  readonly otherMembersRatings = signal<ProductMemberRatingDto[]>([]);
  readonly ratingStatusText = signal<string | null>(null);

  // Derived product & lookup values
  readonly product = computed<Product | null>(() => this.modalData().product ?? null);

  readonly photos = computed<PhotoItem[]>(() => {
    const p = this.product();
    if (!p?.pictureFileNames || !Array.isArray(p.pictureFileNames)) return [];
    return p.pictureFileNames
      .filter((fn) => !!fn)
      .map((fn) => ({
        fileName: fn,
        url: `/api/products/pictures/${fn}`,
        isNew: false,
      }));
  });

  readonly activePhoto = computed<PhotoItem | null>(() => {
    const list = this.photos();
    if (list.length === 0) return null;
    const idx = Math.min(Math.max(0, this.activePhotoIndex()), list.length - 1);
    return list[idx] ?? null;
  });

  readonly descriptionText = computed<string>(() => (this.product()?.description ?? '').trim());

  readonly productGroupName = computed<string | null>(() => {
    const groupId = this.product()?.productGroupId;
    if (!groupId) return null;
    return this.modalData().productGroups.find((g) => g.id === groupId)?.name ?? null;
  });

  readonly parentProductName = computed<string | null>(() => {
    const parentId = this.product()?.parentProductId;
    if (!parentId) return null;
    return this.modalData().allProducts.find((p) => p.id === parentId)?.name ?? null;
  });

  readonly defaultLocation = computed<Location | null>(() => {
    const locId = this.product()?.defaultLocationId;
    if (!locId) return null;
    return this.modalData().locations.find((l) => l.id === locId) ?? null;
  });

  readonly openLocation = computed<Location | null>(() => {
    const locId = this.product()?.openLocationId;
    if (!locId) return null;
    return this.modalData().locations.find((l) => l.id === locId) ?? null;
  });

  readonly defaultStoreName = computed<string | null>(() => {
    const storeId = this.product()?.defaultStoreId;
    if (!storeId) return null;
    return this.modalData().stores.find((s) => s.id === storeId)?.name ?? null;
  });

  readonly quStockName = computed<string | null>(() => {
    const unitId = this.product()?.quStockId;
    if (!unitId) return null;
    return this.modalData().units.find((u) => u.id === unitId)?.name ?? null;
  });

  readonly hasStorageSection = computed<boolean>(() => {
    const p = this.product();
    if (!p) return false;
    return !!(this.defaultLocation() || this.openLocation() || p.moveOnOpen || this.defaultStoreName());
  });

  readonly hasStockSection = computed<boolean>(() => {
    const p = this.product();
    if (!p) return false;
    return !!(
      this.quStockName() ||
      (p.minStockAmount && p.minStockAmount > 0) ||
      p.treatOpenedAsOutOfStock ||
      p.directStockAmount !== undefined ||
      p.aggregatedStockAmount !== undefined
    );
  });

  readonly hasExpirationSection = computed<boolean>(() => {
    const p = this.product();
    if (!p) return false;
    const hasDays =
      (p.defaultBestBeforeDays ?? 0) > 0 ||
      (p.defaultBestBeforeDaysAfterOpen ?? 0) > 0 ||
      (!p.cannotBeFrozen &&
        ((p.defaultBestBeforeDaysAfterFreezing ?? 0) > 0 || (p.defaultBestBeforeDaysAfterThawing ?? 0) > 0));
    return p.dueType === 'use_by' || hasDays;
  });

  readonly filledCustomFields = computed<Array<{ field: ProductCustomField; displayValue: string }>>(() => {
    const p = this.product();
    const values = p?.customFields || {};
    const defs = this.customFieldDefinitions();
    const result: Array<{ field: ProductCustomField; displayValue: string }> = [];

    for (const field of defs) {
      const val = values[field.id];
      if (field.type === 'boolean') {
        if (val === true) {
          result.push({ field, displayValue: 'Yes' });
        }
      } else if (field.type === 'int' || field.type === 'double') {
        if (val !== null && val !== undefined && val !== '' && !Number.isNaN(Number(val))) {
          result.push({ field, displayValue: String(val) });
        }
      } else if (typeof val === 'string' && val.trim() !== '') {
        result.push({ field, displayValue: val.trim() });
      }
    }

    return result;
  });

  readonly shouldCollapseCustomFields = computed<boolean>(
    () => this.filledCustomFields().length > this.customFieldsCollapseThreshold,
  );

  readonly hasAnySpecCard = computed<boolean>(
    () =>
      this.hasStockSection() ||
      this.hasStorageSection() ||
      this.hasExpirationSection() ||
      (this.filledCustomFields().length > 0 && !this.shouldCollapseCustomFields()),
  );

  readonly barcodes = computed<string[]>(() => {
    const list = this.product()?.barcodes;
    if (!list || !Array.isArray(list)) return [];
    return list.filter((b) => !!b?.trim());
  });

  readonly configuredStores = computed<ConfiguredStoreInfo[]>(() => {
    const storeMap = new Map(this.modalData().stores.map((s) => [s.id, s.name]));
    const items: ConfiguredStoreInfo[] = [];

    for (const ps of this.productStores()) {
      const aisle = ps.aisle?.trim() || null;
      const aisleOrder = ps.aisleOrder ?? null;
      const averagePrice = ps.averagePrice ?? null;
      if (!aisle && aisleOrder === null && averagePrice === null) continue;

      const storeName = storeMap.get(ps.storeId);
      if (!storeName) continue;

      items.push({
        storeId: ps.storeId,
        storeName,
        aisle,
        aisleOrder,
        averagePrice,
      });
    }

    return items.sort((a, b) => a.storeName.localeCompare(b.storeName));
  });

  readonly linkedFoods = computed<MealieLinkedFood[]>(() => this.product()?.mealieFoods ?? []);
  readonly linkedRecipes = computed<MealieLinkedRecipe[]>(() => this.product()?.mealieRecipes ?? []);

  readonly inheritedFoods = computed<MealieLinkedFood[]>(() => {
    const parentId = this.product()?.parentProductId;
    const allProducts = this.modalData().allProducts;
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

  readonly inheritedRecipes = computed<MealieLinkedRecipe[]>(() => {
    const parentId = this.product()?.parentProductId;
    const allProducts = this.modalData().allProducts;
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

  readonly hasMealieLinks = computed<boolean>(
    () =>
      this.isMealieConfigured() &&
      (this.linkedFoods().length > 0 ||
        this.linkedRecipes().length > 0 ||
        this.inheritedFoods().length > 0 ||
        this.inheritedRecipes().length > 0),
  );

  readonly mealieBadge = computed<string>(() => {
    const directCount = this.linkedFoods().length + this.linkedRecipes().length;
    const inheritedCount = this.inheritedFoods().length + this.inheritedRecipes().length;
    if (directCount === 0 && inheritedCount === 0) return '';
    if (inheritedCount > 0) {
      return `${directCount} linked (+${inheritedCount} inherited)`;
    }
    return `${directCount} linked`;
  });

  readonly ratedOtherMembers = computed<ProductMemberRatingDto[]>(() =>
    this.otherMembersRatings().filter((m) => m.rating !== null),
  );

  readonly showOtherMembersRatings = computed<boolean>(
    () => this.householdMemberCount() > 1 && this.ratedOtherMembers().length > 0,
  );

  readonly otherRatingsBadge = computed<string>(() => {
    const others = this.otherMembersRatings();
    if (others.length === 0) return '';
    return `${this.ratedOtherMembers().length}/${others.length} rated`;
  });

  ngOnInit(): void {
    this.loadInfoMetadata();

    this.subs.add(
      this.dialogRef.backdropClick.subscribe(() => {
        this.handleDismiss();
      }),
    );

    this.subs.add(
      this.dialogRef.keydownEvents.subscribe((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.handleDismiss();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private loadInfoMetadata(): void {
    const p = this.product();
    if (!p) return;

    this.activePhotoIndex.set(0);

    if (p.stores && Array.isArray(p.stores)) {
      this.productStores.set(p.stores);
    } else if (typeof this.api.getProductStores === 'function' && p.id) {
      this.api
        .getProductStores(p.id)
        .then((storesList) => this.productStores.set(storesList ?? []))
        .catch(() => this.productStores.set([]));
    }

    if (typeof this.api.getMealieStatus === 'function') {
      this.api
        .getMealieStatus()
        .then((st) => this.isMealieConfigured.set(!!st?.configured))
        .catch(() => this.isMealieConfigured.set(false));
    }

    if (typeof this.api.getProductCustomFields === 'function') {
      this.api
        .getProductCustomFields()
        .then((fields) => this.customFieldDefinitions.set([...(fields || [])].sort(compareByNumericOrder)))
        .catch(() => this.customFieldDefinitions.set([]));
    }

    if (p.id && typeof this.api.getProductRatings === 'function') {
      this.api
        .getProductRatings(p.id)
        .then((res) => {
          this.myRating.set(res.myRating);
          this.householdMemberCount.set(res.memberCount);
          this.otherMembersRatings.set(res.otherMembersRatings ?? []);
        })
        .catch(() => {});
    }
  }

  selectPhoto(index: number): void {
    this.activePhotoIndex.set(index);
  }

  async onMyRatingChange(rating: number | null): Promise<void> {
    const p = this.product();
    if (!p?.id || typeof this.api.setProductRating !== 'function') return;

    const previous = this.myRating();
    this.myRating.set(rating);
    this.ratingStatusText.set(null);

    try {
      await this.api.setProductRating(p.id, rating);
    } catch {
      this.myRating.set(previous);
      this.ratingStatusText.set('Failed to save');
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

  switchToEdit(): void {
    this.mode.set('edit');
  }

  openAddToShoppingList(): void {
    const p = this.product();
    if (!p) return;
    this.dialog.open(ShoppingAddModalComponent, {
      disableClose: true,
      data: {
        products: this.modalData().allProducts?.length ? this.modalData().allProducts : [p],
        stores: this.modalData().stores ?? [],
        initialProduct: p,
      },
    });
  }

  openStockModal(): void {
    const p = this.product();
    if (!p) return;
    this.dialog.open(ProductStockModalComponent, {
      data: {
        product: p,
        units: this.modalData().units,
        locations: this.modalData().locations,
        allProducts: this.modalData().allProducts,
      },
    });
  }

  async openRelationsModal(): Promise<void> {
    const p = this.product();
    if (!p) return;
    const { ProductRelationsModalComponent } = await import(
      '../product-relations-modal/product-relations-modal.component.js'
    );
    this.dialog.open(ProductRelationsModalComponent, {
      data: {
        product: p,
        allProducts: this.modalData().allProducts,
        productGroups: this.modalData().productGroups,
        locations: this.modalData().locations,
        units: this.modalData().units,
        stores: this.modalData().stores,
      },
    });
  }

  navigateToGroupPantry(): void {
    const groupId = this.product()?.productGroupId;
    if (!groupId) return;
    this.dialog.closeAll();
    void this.router.navigate(['/pantry'], { queryParams: { group: groupId } });
  }

  onSaved(result: { product: Product; isNew: boolean }): void {
    this.latestSavedResult = result;
    this.modalData.update((prev) => ({
      ...prev,
      product: result.product,
    }));
    this.mode.set('info');
    this.loadInfoMetadata();
  }

  onEditCancelled(): void {
    this.mode.set('info');
  }

  handleDismiss(): void {
    if (this.mode() === 'edit') {
      this.detailView()?.cancel();
      return;
    }
    this.close();
  }

  close(): void {
    this.dialogRef.close(this.latestSavedResult ?? false);
  }
}
