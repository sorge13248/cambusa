import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  LucideAlertTriangle,
  LucideBookOpen,
  LucideRotateCw,
  LucideSearch,
  LucideUtensils,
  LucideX,
} from '@lucide/angular';
import { ApiService } from '../../../core/api.service.js';

export interface MealieLinkModalData {
  mode: 'food' | 'recipe';
  alreadyLinkedIds?: string[];
}

export interface MealieLinkModalResult {
  id: string;
  name: string;
  slug?: string;
}

interface ItemOption {
  id: string;
  name: string;
  slug?: string;
  subLabel?: string;
}

@Component({
  selector: 'app-mealie-link-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAlertTriangle,
    LucideBookOpen,
    LucideRotateCw,
    LucideSearch,
    LucideUtensils,
    LucideX,
  ],
  templateUrl: './mealie-link-modal.component.html',
  styleUrl: './mealie-link-modal.component.scss',
})
export class MealieLinkModalComponent implements OnInit {
  readonly data = inject<MealieLinkModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<MealieLinkModalResult[] | null>);
  private readonly api = inject(ApiService);

  readonly isLoading = signal<boolean>(true);
  readonly isRefreshing = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly error = signal<string | null>(null);
  readonly lastCachedAt = signal<string | null>(null);

  readonly allItems = signal<ItemOption[]>([]);
  readonly selectedItems = signal<Map<string, ItemOption>>(new Map());

  readonly selectedCount = computed(() => this.selectedItems().size);
  readonly selectedItemsList = computed(() => Array.from(this.selectedItems().values()));

  readonly isFoodMode = computed(() => this.data.mode === 'food');
  readonly modalTitle = computed(() => (this.isFoodMode() ? 'Link Mealie Foods' : 'Link Mealie Recipes'));
  readonly inputPlaceholder = computed(() =>
    this.isFoodMode() ? 'Search Mealie foods (e.g. Tomato, Olive Oil)...' : 'Search Mealie recipes (e.g. Pizza, Pasta)...',
  );

  readonly filteredItems = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const alreadyLinked = new Set(this.data.alreadyLinkedIds || []);
    let list = this.allItems();

    if (query) {
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          (item.slug && item.slug.toLowerCase().includes(query)) ||
          (item.subLabel && item.subLabel.toLowerCase().includes(query)),
      );
    }

    const selectedMap = this.selectedItems();

    return list.map((item) => ({
      ...item,
      isAlreadyLinked: alreadyLinked.has(item.id),
      isSelected: selectedMap.has(item.id),
    }));
  });

  async ngOnInit(): Promise<void> {
    await this.loadItems(false);
  }

  async loadItems(forceRefresh = false): Promise<void> {
    if (forceRefresh) {
      this.isRefreshing.set(true);
    } else {
      this.isLoading.set(true);
    }
    this.error.set(null);

    try {
      if (this.isFoodMode()) {
        const res = await this.api.getMealieFoods(forceRefresh);
        this.allItems.set(
          res.items.map((f) => ({
            id: f.id,
            name: f.name,
            subLabel: f.description || undefined,
          })),
        );
        if (res.cachedAt) {
          this.lastCachedAt.set(new Date(res.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      } else {
        const res = await this.api.getMealieRecipes(forceRefresh);
        this.allItems.set(
          res.items.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            subLabel: r.totalTime ? `⏱️ ${r.totalTime}` : undefined,
          })),
        );
        if (res.cachedAt) {
          this.lastCachedAt.set(new Date(res.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      }
    } catch (err: any) {
      this.error.set(err?.error?.message || err?.message || 'Failed to load data from Mealie');
    } finally {
      this.isLoading.set(false);
      this.isRefreshing.set(false);
    }
  }

  isItemSelected(id: string): boolean {
    return this.selectedItems().has(id);
  }

  toggleItem(item: ItemOption): void {
    if (this.data.alreadyLinkedIds?.includes(item.id)) return;
    const map = new Map(this.selectedItems());
    if (map.has(item.id)) {
      map.delete(item.id);
    } else {
      map.set(item.id, item);
    }
    this.selectedItems.set(map);
  }

  deselectItem(id: string): void {
    const map = new Map(this.selectedItems());
    map.delete(id);
    this.selectedItems.set(map);
  }

  clearSelection(): void {
    this.selectedItems.set(new Map());
  }

  confirm(): void {
    const list = Array.from(this.selectedItems().values()).map((sel) => ({
      id: sel.id,
      name: sel.name,
      slug: sel.slug,
    }));
    this.dialogRef.close(list.length > 0 ? list : null);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
