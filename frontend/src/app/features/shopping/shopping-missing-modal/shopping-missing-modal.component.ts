import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { LucidePackage, LucideSparkles, LucideX } from '@lucide/angular';
import { MissingProduct } from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';

export interface ShoppingMissingModalData {
  shoppingListId?: string;
  missingProducts: MissingProduct[];
}

@Component({
  selector: 'app-shopping-missing-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucidePackage, LucideSparkles, LucideX],
  templateUrl: './shopping-missing-modal.component.html',
  styleUrl: './shopping-missing-modal.component.scss',
})
export class ShoppingMissingModalComponent implements OnInit {
  readonly data = inject<ShoppingMissingModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly api = inject(ApiService);

  readonly selectedIds = new Set<string>();
  readonly isAdding = signal<boolean>(false);

  ngOnInit() {
    this.selectAll();
  }

  selectAll() {
    this.selectedIds.clear();
    for (const m of this.data.missingProducts) {
      this.selectedIds.add(m.productId);
    }
  }

  selectNone() {
    this.selectedIds.clear();
  }

  toggle(id: string) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  async addSelected() {
    if (this.selectedIds.size === 0) return;

    this.isAdding.set(true);
    try {
      await this.api.addMissingProducts(
        this.data.shoppingListId,
        Array.from(this.selectedIds),
      );
      this.dialogRef.close(true);
    } catch (err) {
      console.error('Failed to add missing products:', err);
    } finally {
      this.isAdding.set(false);
    }
  }

  close(result: boolean) {
    this.dialogRef.close(result);
  }
}
