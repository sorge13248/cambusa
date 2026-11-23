import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { Location, Product, ProductGroup, QuantityUnit, Store } from '../../../core/models.js';
import { ProductEditorModalComponent } from '../product-editor-modal/product-editor-modal.component.js';
import { ProductStockModalComponent } from '../product-stock-modal/product-stock-modal.component.js';

export interface ProductRelationsModalData {
  product: Product;
  allProducts: Product[];
  productGroups?: ProductGroup[];
  locations?: Location[];
  units?: QuantityUnit[];
  stores?: Store[];
}

@Component({
  selector: 'app-product-relations-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './product-relations-modal.component.html',
  styleUrl: './product-relations-modal.component.scss',
})
export class ProductRelationsModalComponent {
  readonly data = inject<ProductRelationsModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly dialog = inject(Dialog);

  readonly currentProduct = signal<Product>(this.data.product);
  readonly allProductsList = signal<Product[]>(this.data.allProducts);
  hasChanges = false;

  readonly ancestorProducts = computed(() => {
    const list = this.allProductsList();
    const map = new Map(list.map((p) => [p.id, p]));
    const ancestors: Product[] = [];
    const visited = new Set<string>();

    let current = this.currentProduct().parentProductId
      ? map.get(this.currentProduct().parentProductId!)
      : undefined;

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      ancestors.unshift(current);
      current = current.parentProductId ? map.get(current.parentProductId) : undefined;
    }

    return ancestors;
  });

  readonly directParent = computed(() => {
    const chain = this.ancestorProducts();
    return chain.length > 0 ? chain[chain.length - 1] : null;
  });

  readonly childProducts = computed(() => {
    const curId = this.currentProduct().id;
    return this.allProductsList().filter((p) => p.parentProductId === curId);
  });

  readonly descendantProducts = computed(() => {
    const curId = this.currentProduct().id;
    const directChildren = this.childProducts();
    const directIds = new Set(directChildren.map((c) => c.id));
    const descendants: Product[] = [];

    const map = new Map<string, Product[]>();
    for (const p of this.allProductsList()) {
      if (p.parentProductId) {
        const arr = map.get(p.parentProductId) ?? [];
        arr.push(p);
        map.set(p.parentProductId, arr);
      }
    }

    const queue = [...directChildren.flatMap((c) => map.get(c.id) ?? [])];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const p = queue.shift()!;
      if (!visited.has(p.id) && !directIds.has(p.id) && p.id !== curId) {
        visited.add(p.id);
        descendants.push(p);
        const next = map.get(p.id);
        if (next) queue.push(...next);
      }
    }

    return descendants;
  });

  getGroupName(groupId: string | null | undefined): string {
    if (!groupId || !this.data.productGroups) return '';
    return this.data.productGroups.find((g) => g.id === groupId)?.name ?? '';
  }

  openStockModal(p: Product, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.dialog.open(ProductStockModalComponent, {
      data: {
        product: p,
        units: this.data.units,
        locations: this.data.locations,
        allProducts: this.allProductsList(),
      },
    });
  }

  openEditProductModal(p: Product, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    const editRef = this.dialog.open(ProductEditorModalComponent, {
      disableClose: true,
      data: {
        product: p,
        allProducts: this.allProductsList(),
        productGroups: this.data.productGroups || [],
        locations: this.data.locations || [],
        units: this.data.units || [],
        stores: this.data.stores || [],
      },
    });

    firstValueFrom(editRef.closed).then((res: any) => {
      if (res && res.product) {
        this.hasChanges = true;
        const updated = res.product as Product;
        this.allProductsList.set(
          this.allProductsList().map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
        );
        if (this.currentProduct().id === updated.id) {
          this.currentProduct.set({ ...this.currentProduct(), ...updated });
        }
      }
    });
  }

  close() {
    this.dialogRef.close({ hasChanges: this.hasChanges, products: this.allProductsList() });
  }
}
