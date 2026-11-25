import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { LucidePackage, LucidePencil, LucideSnowflake, LucideX } from '@lucide/angular';
import { Location, Product, QuantityUnit, StockItem } from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';
import { LocalDatePipe } from '../../../shared/pipes/local-date.pipe.js';
import { StockItemEditorModalComponent } from '../../pantry/stock-item-editor-modal/stock-item-editor-modal.component.js';

export interface ProductStockModalData {
  product: Product;
  units?: QuantityUnit[];
  locations?: Location[];
  allProducts?: Product[];
}

@Component({
  selector: 'app-product-stock-modal',
  standalone: true,
  imports: [CommonModule, LocalDatePipe, LucidePackage, LucidePencil, LucideSnowflake, LucideX],
  templateUrl: './product-stock-modal.component.html',
  styleUrl: './product-stock-modal.component.scss',
})
export class ProductStockModalComponent implements OnInit {
  readonly data = inject<ProductStockModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly api = inject(ApiService);

  readonly isLoading = signal<boolean>(true);
  readonly directStockItems = signal<StockItem[]>([]);
  readonly childStockItems = signal<StockItem[]>([]);

  readonly totalDirectAmount = computed(() =>
    this.directStockItems().reduce((acc, item) => acc + (item.amount || 0), 0),
  );

  readonly totalFamilyAmount = computed(() => {
    const direct = this.totalDirectAmount();
    const children = this.childStockItems().reduce((acc, item) => acc + (item.amount || 0), 0);
    return direct + children;
  });

  readonly stockUnitName = computed(() => {
    const quId = this.data.product.quStockId;
    if (!quId || !this.data.units) return '';
    return this.data.units.find((u) => u.id === quId)?.name ?? '';
  });

  readonly expiredCount = computed(
    () => this.directStockItems().filter((item) => item.urgency === 'expired').length,
  );

  readonly dueSoonCount = computed(
    () => this.directStockItems().filter((item) => item.urgency === 'due_soon').length,
  );

  async ngOnInit() {
    await this.loadStock();
  }

  async loadStock() {
    this.isLoading.set(true);
    try {
      const allStock = await this.api.getStock();
      const direct = allStock.filter((s) => s.productId === this.data.product.id);
      this.directStockItems.set(direct);

      // Collect child products stock if this product has children
      if (this.data.allProducts && this.data.allProducts.length > 0) {
        const childIds = new Set<string>();
        const queue = [this.data.product.id];
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          for (const p of this.data.allProducts) {
            if (p.parentProductId === currentId && !childIds.has(p.id)) {
              childIds.add(p.id);
              queue.push(p.id);
            }
          }
        }

        if (childIds.size > 0) {
          const childrenStock = allStock.filter((s) => childIds.has(s.productId));
          this.childStockItems.set(childrenStock);
        } else {
          this.childStockItems.set([]);
        }
      }
    } catch (err) {
      console.error('Failed to load product stock:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  getUrgencyLabel(urgency: string): string {
    switch (urgency) {
      case 'expired':
        return 'Expired';
      case 'due_soon':
        return 'Due Soon';
      case 'approaching':
        return 'Approaching';
      case 'good':
        return 'Good';
      default:
        return 'No Expiration';
    }
  }

  getDaysLabel(days: number | null): string {
    if (days === null || days === undefined) return '';
    if (days < 0) {
      const abs = Math.abs(days);
      return `Expired ${abs} day${abs === 1 ? '' : 's'} ago`;
    }
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    return `${days} days remaining`;
  }

  openEditStockItem(item: StockItem) {
    const editRef = this.dialog.open(StockItemEditorModalComponent, {
      disableClose: true,
      data: {
        stockItem: item,
        locations: this.data.locations || [],
        product: this.data.product,
      },
    });

    firstValueFrom(editRef.closed).then((res: any) => {
      if (res && res.updated) {
        this.loadStock();
      }
    });
  }

  close() {
    this.dialogRef.close();
  }
}
