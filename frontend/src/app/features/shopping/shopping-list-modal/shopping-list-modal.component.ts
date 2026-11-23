import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ShoppingList, Store } from '../../../core/models.js';
import { ApiService } from '../../../core/api.service.js';

export interface ShoppingListModalData {
  shoppingList?: ShoppingList | null;
  stores: Store[];
}

@Component({
  selector: 'app-shopping-list-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shopping-list-modal.component.html',
  styleUrl: './shopping-list-modal.component.scss',
})
export class ShoppingListModalComponent implements OnInit {
  readonly data = inject<ShoppingListModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly api = inject(ApiService);

  name = '';
  storeId: string | null = null;
  readonly isSaving = signal<boolean>(false);

  ngOnInit() {
    if (this.data.shoppingList) {
      this.name = this.data.shoppingList.name;
      this.storeId = this.data.shoppingList.storeId || null;
    }
  }

  async save() {
    if (!this.name.trim()) return;

    this.isSaving.set(true);
    try {
      if (this.data.shoppingList) {
        await this.api.updateShoppingList(this.data.shoppingList.id, {
          name: this.name.trim(),
          storeId: this.storeId || null,
        });
      } else {
        await this.api.createShoppingList({
          name: this.name.trim(),
          storeId: this.storeId || null,
        });
      }
      this.dialogRef.close(true);
    } catch (err) {
      console.error('Failed to save shopping list:', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  close(result: boolean) {
    this.dialogRef.close(result);
  }
}
