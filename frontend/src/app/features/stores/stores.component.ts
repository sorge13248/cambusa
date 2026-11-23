import { CommonModule } from '@angular/common';
import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { Store } from '../../core/models.js';

@Component({
  selector: 'app-stores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stores.component.html',
  styleUrl: './stores.component.scss',
})
export class StoresComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly stores = signal<Store[]>([]);
  readonly isLoading = signal<boolean>(true);

  readonly isModalOpen = signal<boolean>(false);
  editingStoreId: string | null = null;
  storeName = '';
  storeDescription = '';

  constructor() {
    effect(() => {
      const hhId = this.auth.activeHouseholdId();
      if (hhId) {
        this.loadStores();
      }
    });
  }

  ngOnInit() {
    this.loadStores();
  }

  async loadStores() {
    this.isLoading.set(true);
    try {
      const data = await this.api.getStores();
      this.stores.set(data);
    } finally {
      this.isLoading.set(false);
    }
  }

  openAddStoreModal() {
    this.editingStoreId = null;
    this.storeName = '';
    this.storeDescription = '';
    this.isModalOpen.set(true);
  }

  openEditStoreModal(s: Store) {
    this.editingStoreId = s.id;
    this.storeName = s.name;
    this.storeDescription = s.description || '';
    this.isModalOpen.set(true);
  }

  async saveStore() {
    if (!this.storeName.trim()) return;

    if (this.editingStoreId) {
      await this.api.updateStore(this.editingStoreId, {
        name: this.storeName.trim(),
        description: this.storeDescription.trim() || undefined,
      });
    } else {
      await this.api.createStore({
        name: this.storeName.trim(),
        description: this.storeDescription.trim() || undefined,
      });
    }

    this.isModalOpen.set(false);
    await this.loadStores();
  }

  async deleteStore(id: string) {
    await this.api.deleteStore(id);
    await this.loadStores();
  }
}
