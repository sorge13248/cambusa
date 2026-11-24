import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, Injector, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Aisle,
  CreatedApiKeyDto,
  HouseholdInvitationDto,
  HouseholdMemberDto,
  Location,
  MealieFoodSummary,
  MealieProductRecipesResponse,
  MealieRecipeSummary,
  MealieTestResultDto,
  MissingProduct,
  NextResponseDto,
  Product,
  ProductGroup,
  ProductStore,
  QuantityUnit,
  ReceivedInvitationDto,
  SavedFilter,
  ShoppingList,
  ShoppingListItem,
  StockItem,
  Store,
  User,
  UserHouseholdSummary,
  UserSettingsDto,
  ProfileDataDto,
} from './models.js';
import { OfflineStorageService } from './offline-storage.service.js';
import { SyncService } from './sync.service.js';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(OfflineStorageService);
  private readonly injector = inject(Injector);

  readonly activeHouseholdId = signal<string | null>(null);
  private readonly productsDetailFetchedForHouseholds = new Set<string>();
  private readonly productsDetailInFlight = new Map<string, Promise<void>>();

  private get syncService(): SyncService {
    return this.injector.get(SyncService);
  }

  private get headers(): HttpHeaders {
    let h = new HttpHeaders();
    const hhId = this.activeHouseholdId();
    if (hhId) {
      h = h.set('x-household-id', hhId);
    }
    return h;
  }

  private get options() {
    return {
      headers: this.headers,
      withCredentials: true,
    };
  }

  // Auth & Profile
  getMe(): Promise<{
    user: User;
    households: UserHouseholdSummary[];
    activeHouseholdId: string | null;
    pendingInvitationsCount: number;
  }> {
    return firstValueFrom(
      this.http.get<{
        user: User;
        households: UserHouseholdSummary[];
        activeHouseholdId: string | null;
        pendingInvitationsCount: number;
      }>('/api/auth/me', { withCredentials: true }),
    );
  }

  logout(): Promise<{ loggedOut: boolean }> {
    return firstValueFrom(this.http.post<{ loggedOut: boolean }>('/api/auth/logout', {}, { withCredentials: true }));
  }

  refresh(): Promise<{ refreshed: boolean; expiresIn?: number }> {
    return firstValueFrom(
      this.http.post<{ refreshed: boolean; expiresIn?: number }>('/api/auth/refresh', {}, { withCredentials: true }),
    );
  }

  // Households
  getHouseholds(): Promise<UserHouseholdSummary[]> {
    return firstValueFrom(this.http.get<UserHouseholdSummary[]>('/api/households', this.options));
  }

  createHousehold(name: string): Promise<any> {
    return firstValueFrom(this.http.post('/api/households', { name }, this.options));
  }

  updateHousehold(id: string, name: string): Promise<any> {
    return firstValueFrom(this.http.put(`/api/households/${id}`, { name }, this.options));
  }

  deleteHousehold(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/households/${id}`, this.options));
  }

  getHouseholdMembers(householdId: string): Promise<HouseholdMemberDto[]> {
    return firstValueFrom(this.http.get<HouseholdMemberDto[]>(`/api/households/${householdId}/members`, this.options));
  }

  sendInvitation(householdId: string, email: string): Promise<HouseholdInvitationDto> {
    return firstValueFrom(
      this.http.post<HouseholdInvitationDto>(`/api/households/${householdId}/invitations`, { email }, this.options),
    );
  }

  getSentInvitations(householdId: string): Promise<HouseholdInvitationDto[]> {
    return firstValueFrom(
      this.http.get<HouseholdInvitationDto[]>(`/api/households/${householdId}/invitations`, this.options),
    );
  }

  revokeInvitation(householdId: string, invitationId: string): Promise<any> {
    return firstValueFrom(
      this.http.delete(`/api/households/${householdId}/invitations/${invitationId}`, this.options),
    );
  }

  getReceivedInvitations(): Promise<ReceivedInvitationDto[]> {
    return firstValueFrom(
      this.http.get<ReceivedInvitationDto[]>('/api/households/invitations/received', this.options),
    );
  }

  respondToInvitation(invitationId: string, accept: boolean): Promise<any> {
    return firstValueFrom(
      this.http.post(`/api/households/invitations/${invitationId}/respond`, { accept }, this.options),
    );
  }

  // Catalogs: Units, Groups, Locations, Stores
  private async getCatalogItems<K extends 'units' | 'groups' | 'locations' | 'stores'>(
    key: K,
    endpoint: string,
  ): Promise<
    K extends 'units'
      ? QuantityUnit[]
      : K extends 'groups'
        ? ProductGroup[]
        : K extends 'locations'
          ? Location[]
          : Store[]
  > {
    const hhId = this.activeHouseholdId() || undefined;
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    if (hhId) {
      const isHydrated = await this.syncService.isHouseholdHydrated(hhId);
      const cat = await this.storage.getCatalogs(hhId);
      if (isHydrated && cat[key].length > 0) {
        this.syncService.sync().catch(() => {});
        return cat[key] as any;
      }
      await this.syncService.sync().catch(() => {});
      const ref = await this.storage.getCatalogs(hhId);
      const nowHydrated = await this.syncService.isHouseholdHydrated(hhId);
      if (nowHydrated || (!isOnline && ref[key].length > 0)) {
        return ref[key] as any;
      }
    }
    try {
      const items = await firstValueFrom(this.http.get<any[]>(endpoint, this.options));
      await this.storage.saveCatalogs(hhId || 'default', { [key]: items }, { replace: true });
      return items as any;
    } catch {
      if (hhId) {
        const fallback = await this.storage.getCatalogs(hhId);
        return fallback[key] as any;
      }
      return [] as any;
    }
  }

  getUnits(): Promise<QuantityUnit[]> {
    return this.getCatalogItems('units', '/api/catalogs/units');
  }

  getQuantityUnits(): Promise<QuantityUnit[]> {
    return this.getUnits();
  }

  async createUnit(data: Partial<QuantityUnit>): Promise<QuantityUnit> {
    const id = data.id || `unit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hhId = this.activeHouseholdId() || 'default';
    const unit: QuantityUnit = { id, name: data.name || 'unit', description: data.description } as QuantityUnit;
    const cat = await this.storage.getCatalogs(hhId);
    await this.storage.saveCatalogs(hhId, { units: [...cat.units, unit] });
    await this.storage.enqueue({ entity: 'catalog', action: 'create', payload: { type: 'unit', ...unit } });
    this.syncService.sync().catch(() => {});
    return unit;
  }

  async updateUnit(id: string, data: Partial<QuantityUnit>): Promise<QuantityUnit> {
    const hhId = this.activeHouseholdId() || 'default';
    const cat = await this.storage.getCatalogs(hhId);
    const updated = cat.units.map((u) => (u.id === id ? { ...u, ...data } : u));
    await this.storage.saveCatalogs(hhId, { units: updated });
    await this.storage.enqueue({ entity: 'catalog', action: 'update', payload: { type: 'unit', id, ...data } });
    this.syncService.sync().catch(() => {});
    return updated.find((u) => u.id === id) || ({ id, ...data } as any);
  }

  async deleteUnit(id: string): Promise<void> {
    const hhId = this.activeHouseholdId() || 'default';
    await this.storage.removeCatalogItem(hhId, 'unit', id);
    await this.storage.enqueue({ entity: 'catalog', action: 'delete', payload: { type: 'unit', id } });
    this.syncService.sync().catch(() => {});
  }

  getGroups(): Promise<ProductGroup[]> {
    return this.getCatalogItems('groups', '/api/catalogs/groups');
  }

  getProductGroups(): Promise<ProductGroup[]> {
    return this.getGroups();
  }

  async createGroup(data: Partial<ProductGroup>): Promise<ProductGroup> {
    const id = data.id || `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hhId = this.activeHouseholdId() || 'default';
    const group: ProductGroup = { id, name: data.name || 'group', description: data.description } as ProductGroup;
    const cat = await this.storage.getCatalogs(hhId);
    await this.storage.saveCatalogs(hhId, { groups: [...cat.groups, group] });
    await this.storage.enqueue({ entity: 'catalog', action: 'create', payload: { type: 'group', ...group } });
    this.syncService.sync().catch(() => {});
    return group;
  }

  async updateGroup(id: string, data: Partial<ProductGroup>): Promise<ProductGroup> {
    const hhId = this.activeHouseholdId() || 'default';
    const cat = await this.storage.getCatalogs(hhId);
    const updated = cat.groups.map((g) => (g.id === id ? { ...g, ...data } : g));
    await this.storage.saveCatalogs(hhId, { groups: updated });
    await this.storage.enqueue({ entity: 'catalog', action: 'update', payload: { type: 'group', id, ...data } });
    this.syncService.sync().catch(() => {});
    return updated.find((g) => g.id === id) || ({ id, ...data } as any);
  }

  async deleteGroup(id: string): Promise<void> {
    const hhId = this.activeHouseholdId() || 'default';
    await this.storage.removeCatalogItem(hhId, 'group', id);
    await this.storage.enqueue({ entity: 'catalog', action: 'delete', payload: { type: 'group', id } });
    this.syncService.sync().catch(() => {});
  }

  getLocations(): Promise<Location[]> {
    return this.getCatalogItems('locations', '/api/catalogs/locations');
  }

  async createLocation(data: Partial<Location>): Promise<Location> {
    const id = data.id || `loc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hhId = this.activeHouseholdId() || 'default';
    const loc: Location = { id, name: data.name || 'location', isFreezer: data.isFreezer || false } as Location;
    const cat = await this.storage.getCatalogs(hhId);
    await this.storage.saveCatalogs(hhId, { locations: [...cat.locations, loc] });
    await this.storage.enqueue({ entity: 'catalog', action: 'create', payload: { type: 'location', ...loc } });
    this.syncService.sync().catch(() => {});
    return loc;
  }

  async updateLocation(id: string, data: Partial<Location>): Promise<Location> {
    const hhId = this.activeHouseholdId() || 'default';
    const cat = await this.storage.getCatalogs(hhId);
    const updated = cat.locations.map((l) => (l.id === id ? { ...l, ...data } : l));
    await this.storage.saveCatalogs(hhId, { locations: updated });
    await this.storage.enqueue({ entity: 'catalog', action: 'update', payload: { type: 'location', id, ...data } });
    this.syncService.sync().catch(() => {});
    return updated.find((l) => l.id === id) || ({ id, ...data } as any);
  }

  async deleteLocation(id: string): Promise<void> {
    const hhId = this.activeHouseholdId() || 'default';
    await this.storage.removeCatalogItem(hhId, 'location', id);
    await this.storage.enqueue({ entity: 'catalog', action: 'delete', payload: { type: 'location', id } });
    this.syncService.sync().catch(() => {});
  }

  getStores(): Promise<Store[]> {
    return this.getCatalogItems('stores', '/api/catalogs/stores');
  }

  async createStore(data: Partial<Store>): Promise<Store> {
    const id = data.id || `store-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hhId = this.activeHouseholdId() || 'default';
    const store: Store = { id, name: data.name || 'Store' } as Store;
    const cat = await this.storage.getCatalogs(hhId);
    await this.storage.saveCatalogs(hhId, { stores: [...cat.stores, store] });
    await this.storage.enqueue({ entity: 'catalog', action: 'create', payload: { type: 'store', ...store } });
    this.syncService.sync().catch(() => {});
    return store;
  }

  async updateStore(id: string, data: Partial<Store>): Promise<Store> {
    const hhId = this.activeHouseholdId() || 'default';
    const cat = await this.storage.getCatalogs(hhId);
    const updated = cat.stores.map((s) => (s.id === id ? { ...s, ...data } : s));
    await this.storage.saveCatalogs(hhId, { stores: updated });
    await this.storage.enqueue({ entity: 'catalog', action: 'update', payload: { type: 'store', id, ...data } });
    this.syncService.sync().catch(() => {});
    return updated.find((s) => s.id === id) || ({ id, ...data } as any);
  }

  async deleteStore(id: string): Promise<void> {
    const hhId = this.activeHouseholdId() || 'default';
    await this.storage.removeCatalogItem(hhId, 'store', id);
    await this.storage.enqueue({ entity: 'catalog', action: 'delete', payload: { type: 'store', id } });
    this.syncService.sync().catch(() => {});
  }

  // Aisles
  async getAisles(storeId?: string): Promise<Aisle[]> {
    const hhId = this.activeHouseholdId() || 'default';
    const cacheKey = `aisles_${hhId}`;
    try {
      const params = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
      const remote = await firstValueFrom(this.http.get<Aisle[]>(`/api/catalogs/aisles${params}`, this.options));
      if (!storeId) {
        await this.storage.setMeta(cacheKey, remote);
      } else {
        const existing = (await this.storage.getMeta(cacheKey)) as Aisle[] | null;
        if (Array.isArray(existing)) {
          const merged = [...existing.filter((a) => a.storeId !== storeId), ...remote];
          await this.storage.setMeta(cacheKey, merged);
        } else {
          await this.storage.setMeta(cacheKey, remote);
        }
      }
      return remote;
    } catch {
      const cached = (await this.storage.getMeta(cacheKey)) as Aisle[] | null;
      if (Array.isArray(cached)) {
        return storeId ? cached.filter((a) => a.storeId === storeId) : cached;
      }
      return [];
    }
  }

  async getStoreAisles(storeId: string): Promise<Aisle[]> {
    const hhId = this.activeHouseholdId() || 'default';
    const cacheKey = `aisles_${hhId}`;
    try {
      const remote = await firstValueFrom(
        this.http.get<Aisle[]>(`/api/catalogs/stores/${storeId}/aisles`, this.options),
      );
      const existing = (await this.storage.getMeta(cacheKey)) as Aisle[] | null;
      const merged = Array.isArray(existing)
        ? [...existing.filter((a) => a.storeId !== storeId), ...remote]
        : remote;
      await this.storage.setMeta(cacheKey, merged);
      return remote;
    } catch {
      const cached = (await this.storage.getMeta(cacheKey)) as Aisle[] | null;
      return Array.isArray(cached) ? cached.filter((a) => a.storeId === storeId) : [];
    }
  }

  createAisle(storeId: string, data: { name: string; sortOrder?: number }): Promise<Aisle> {
    return firstValueFrom(this.http.post<Aisle>(`/api/catalogs/stores/${storeId}/aisles`, data, this.options));
  }

  updateAisle(id: string, data: { name?: string; sortOrder?: number }): Promise<Aisle> {
    return firstValueFrom(this.http.put<Aisle>(`/api/catalogs/aisles/${id}`, data, this.options));
  }

  deleteAisle(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/catalogs/aisles/${id}`, this.options));
  }

  reorderStoreAisles(storeId: string, aisleIds: string[]): Promise<Aisle[]> {
    return firstValueFrom(
      this.http.post<Aisle[]>(`/api/catalogs/stores/${storeId}/aisles/reorder`, { aisleIds }, this.options),
    );
  }

  // Product Store
  getProductStores(productId: string): Promise<ProductStore[]> {
    return firstValueFrom(this.http.get<ProductStore[]>(`/api/products/${productId}/stores`, this.options));
  }

  async setProductStore(productId: string, storeId: string, data: Partial<ProductStore>): Promise<ProductStore> {
    const res = await firstValueFrom(
      this.http.put<ProductStore>(`/api/products/${productId}/stores/${storeId}`, data, this.options),
    );
    const hhId = this.activeHouseholdId();
    if (hhId) {
      this.productsDetailFetchedForHouseholds.delete(hhId);
    }
    return res;
  }

  async removeProductStore(productId: string, storeId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`/api/products/${productId}/stores/${storeId}`, this.options),
    );
    const hhId = this.activeHouseholdId();
    if (hhId) {
      this.productsDetailFetchedForHouseholds.delete(hhId);
    }
  }

  // Pictures
  uploadProductPicture(productId: string, file: File): Promise<{ fileName: string; url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return firstValueFrom(
      this.http.post<{ fileName: string; url: string }>(
        `/api/products/${productId}/picture`,
        formData,
        this.options,
      ),
    );
  }

  deleteProductPicture(productId: string, fileName: string): Promise<{ pictures: string[] }> {
    return firstValueFrom(
      this.http.delete<{ pictures: string[] }>(`/api/products/${productId}/picture/${fileName}`, this.options),
    );
  }

  reorderProductPictures(productId: string, pictureFileNames: string[]): Promise<{ pictures: string[] }> {
    return firstValueFrom(
      this.http.put<{ pictures: string[] }>(`/api/products/${productId}/pictures/order`, { pictureFileNames }, this.options),
    );
  }

  // Products
  async getProducts(includeInactive = false, skipBackgroundSync = false): Promise<Product[]> {
    const hhId = this.activeHouseholdId() || undefined;
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    if (hhId) {
      const isHydrated = await this.syncService.isHouseholdHydrated(hhId);
      const local = await this.storage.getProducts(hhId);
      if (isHydrated && local.length > 0) {
        if (!skipBackgroundSync) {
          this.syncService.sync().catch(() => {});
          if (
            isOnline &&
            !this.productsDetailFetchedForHouseholds.has(hhId) &&
            !local.some((p) => Array.isArray(p.stores))
          ) {
            void this.refreshProductDetails(hhId);
          }
        }
        return this.enrichAndFilterProducts(local, hhId, includeInactive);
      }

      await this.syncService.sync().catch(() => {});
      const refreshed = await this.storage.getProducts(hhId);
      const nowHydrated = await this.syncService.isHouseholdHydrated(hhId);
      if (nowHydrated || (!isOnline && refreshed.length > 0)) {
        if (
          isOnline &&
          !skipBackgroundSync &&
          !this.productsDetailFetchedForHouseholds.has(hhId) &&
          refreshed.length > 0 &&
          !refreshed.some((p) => Array.isArray(p.stores))
        ) {
          void this.refreshProductDetails(hhId);
        }
        return this.enrichAndFilterProducts(refreshed, hhId, includeInactive);
      }
    }

    try {
      const remote = await firstValueFrom(
        this.http.get<Product[]>('/api/products?includeInactive=true', this.options),
      );
      if (remote.length > 0) {
        await this.storage.saveProducts(remote);
        if (hhId) {
          this.productsDetailFetchedForHouseholds.add(hhId);
        }
      }
      return includeInactive ? remote : remote.filter((p) => p.active !== false);
    } catch {
      if (hhId) {
        const fallback = await this.storage.getProducts(hhId);
        return this.enrichAndFilterProducts(fallback, hhId, includeInactive);
      }
      return [];
    }
  }

  private async refreshProductDetails(hhId: string): Promise<void> {
    const existing = this.productsDetailInFlight.get(hhId);
    if (existing) {
      return existing;
    }

    const task = (async () => {
      try {
        await this.syncService.sync().catch(() => {});
        const queue = await this.storage.getQueue();
        if (queue.some((q) => q.entity === 'product')) {
          return;
        }
        const remote = await firstValueFrom(
          this.http.get<Product[]>('/api/products?includeInactive=true', this.options),
        );
        if (this.activeHouseholdId() !== hhId) {
          return;
        }
        this.productsDetailFetchedForHouseholds.add(hhId);
        if (remote.length > 0) {
          await this.storage.saveProducts(remote);
          this.syncService.notifyDataRefreshed();
        }
      } catch {
        // Ignore background detail refresh errors when offline
      } finally {
        this.productsDetailInFlight.delete(hhId);
      }
    })();

    this.productsDetailInFlight.set(hhId, task);
    return task;
  }

  private async enrichAndFilterProducts(
    products: Product[],
    hhId: string,
    includeInactive: boolean,
  ): Promise<Product[]> {
    const stockItems = await this.storage.getStock(hhId);
    const stockByProduct = new Map<string, number>();
    for (const item of stockItems) {
      stockByProduct.set(item.productId, (stockByProduct.get(item.productId) ?? 0) + (item.amount || 0));
    }

    const productMap = new Map<string, Product>();
    const childrenMap = new Map<string, Product[]>();
    for (const p of products) {
      productMap.set(p.id, p);
      if (p.parentProductId) {
        const children = childrenMap.get(p.parentProductId) ?? [];
        children.push(p);
        childrenMap.set(p.parentProductId, children);
      }
    }

    const resolveAncestors = (productId: string): Array<{ id: string; name: string }> => {
      const ancestors: Array<{ id: string; name: string }> = [];
      let current = productMap.get(productId);
      const visited = new Set<string>();
      while (current?.parentProductId && !visited.has(current.parentProductId)) {
        visited.add(current.id);
        const parent = productMap.get(current.parentProductId);
        if (!parent) break;
        ancestors.unshift({ id: parent.id, name: parent.name });
        current = parent;
      }
      return ancestors;
    };

    const aggregatedMemo = new Map<string, number>();
    const calcAggregated = (productId: string, visiting = new Set<string>()): number => {
      if (aggregatedMemo.has(productId)) {
        return aggregatedMemo.get(productId)!;
      }
      if (visiting.has(productId)) {
        return 0;
      }
      visiting.add(productId);
      let total = stockByProduct.get(productId) ?? 0;
      for (const child of childrenMap.get(productId) ?? []) {
        total += calcAggregated(child.id, visiting);
      }
      visiting.delete(productId);
      aggregatedMemo.set(productId, total);
      return total;
    };

    return products
      .filter((p) => (includeInactive ? true : p.active !== false))
      .map((p) => {
        const ancestors = resolveAncestors(p.id);
        const hierarchyPath = [...ancestors.map((a) => a.name), p.name].join(' > ');
        const directStockAmount = stockByProduct.get(p.id) ?? 0;
        const aggregatedStockAmount = calcAggregated(p.id);
        return {
          ...p,
          ancestors,
          hierarchyPath,
          directStockAmount,
          aggregatedStockAmount,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProduct(id: string): Promise<Product> {
    const local = await this.storage.getProduct(id);
    if (local) return local;
    try {
      const remote = await firstValueFrom(this.http.get<Product>(`/api/products/${id}`, this.options));
      await this.storage.putProduct(remote);
      return remote;
    } catch {
      throw new Error(`Product not found: ${id}`);
    }
  }

  async createProduct(data: Partial<Product>): Promise<Product> {
    const id = data.id || `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hhId = this.activeHouseholdId() || data.householdId || '';
    const prod: Product = {
      id,
      householdId: hhId,
      name: data.name || 'New Product',
      description: data.description ?? null,
      productGroupId: data.productGroupId ?? null,
      active: data.active ?? true,
      defaultLocationId: data.defaultLocationId || (data as any).locationId || null,
      quStockId: data.quStockId ?? null,
      quPurchaseId: data.quPurchaseId ?? null,
      minStockAmount: data.minStockAmount ?? 0,
      defaultBestBeforeDays: data.defaultBestBeforeDays ?? 0,
      cannotBeFrozen: data.cannotBeFrozen ?? false,
      barcodes: data.barcodes || [],
      ...data,
    } as Product;
    await this.storage.putProduct(prod);
    await this.storage.enqueue({ entity: 'product', action: 'create', payload: prod });
    this.syncService.sync().catch(() => {});
    return prod;
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    const existing = await this.storage.getProduct(id);
    const merged: Product = { ...(existing || {}), ...data, id } as Product;
    await this.storage.putProduct(merged);
    await this.storage.enqueue({ entity: 'product', action: 'update', payload: merged });
    this.syncService.sync().catch(() => {});
    return merged;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.storage.deleteProduct(id);
    await this.storage.enqueue({ entity: 'product', action: 'delete', payload: { id } });
    this.syncService.sync().catch(() => {});
  }

  // Stock
  async getStock(dueSoonDays = 5): Promise<StockItem[]> {
    const hhId = this.activeHouseholdId() || undefined;
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    if (hhId) {
      const isHydrated = await this.syncService.isHouseholdHydrated(hhId);
      const local = await this.storage.getStock(hhId);
      if (isHydrated && local.length > 0) {
        this.syncService.sync().catch(() => {});
        return this.enrichStockItems(local, hhId, dueSoonDays);
      }
      await this.syncService.sync().catch(() => {});
      const refreshed = await this.storage.getStock(hhId);
      const nowHydrated = await this.syncService.isHouseholdHydrated(hhId);
      if (nowHydrated || (!isOnline && refreshed.length > 0)) {
        return this.enrichStockItems(refreshed, hhId, dueSoonDays);
      }
    }
    try {
      const remote = await firstValueFrom(this.http.get<StockItem[]>('/api/stock', this.options));
      await this.storage.saveStock(remote);
      return remote;
    } catch {
      if (!hhId) return [];
      const fallback = await this.storage.getStock(hhId);
      return this.enrichStockItems(fallback, hhId, dueSoonDays);
    }
  }

  private async enrichStockItems(
    items: StockItem[],
    hhId: string,
    dueSoonDays = 5,
  ): Promise<StockItem[]> {
    const [products, catalogs] = await Promise.all([
      this.storage.getProducts(hhId),
      this.storage.getCatalogs(hhId),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const unitMap = new Map((catalogs?.units || []).map((u) => [u.id, u]));
    const locationMap = new Map((catalogs?.locations || []).map((l) => [l.id, l]));

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();

    return items
      .map((item) => {
        const product = productMap.get(item.productId);
        const location = item.locationId ? locationMap.get(item.locationId) : null;
        const unit = product?.quStockId ? unitMap.get(product.quStockId) : null;
        const pictureFileNames = Array.isArray(product?.pictureFileNames) ? product.pictureFileNames : [];

        let effectiveBestBeforeDate = item.bestBeforeDate ?? null;
        if (effectiveBestBeforeDate && effectiveBestBeforeDate.startsWith('2999')) {
          effectiveBestBeforeDate = null;
        }

        let urgency: StockItem['urgency'] = 'none';
        let daysUntilExpiration: number | null = null;

        if (effectiveBestBeforeDate) {
          const itemMs = new Date(`${effectiveBestBeforeDate.slice(0, 10)}T00:00:00Z`).getTime();
          daysUntilExpiration = Math.ceil((itemMs - todayMs) / (24 * 60 * 60 * 1000));
          if (daysUntilExpiration < 0) {
            urgency = 'expired';
          } else if (daysUntilExpiration <= dueSoonDays) {
            urgency = 'due_soon';
          } else if (daysUntilExpiration <= dueSoonDays + 4) {
            urgency = 'approaching';
          } else {
            urgency = 'good';
          }
        }

        return {
          ...item,
          productName: product?.name || item.productName || 'Unknown Product',
          productPictureFileNames:
            pictureFileNames.length > 0 ? pictureFileNames : (item.productPictureFileNames ?? []),
          productPictureFileName: pictureFileNames[0] ?? item.productPictureFileName ?? null,
          productBarcodes: Array.isArray(product?.barcodes) ? product.barcodes : (item.productBarcodes ?? []),
          productCannotBeFrozen: product?.cannotBeFrozen ?? item.productCannotBeFrozen ?? false,
          productGroupId: product?.productGroupId ?? item.productGroupId ?? null,
          quName: unit?.name ?? item.quName ?? null,
          locationName: location?.name ?? item.locationName ?? null,
          bestBeforeDate: effectiveBestBeforeDate,
          urgency,
          daysUntilExpiration,
        };
      })
      .sort((a, b) => {
        if (a.bestBeforeDate && b.bestBeforeDate) {
          return a.bestBeforeDate.localeCompare(b.bestBeforeDate);
        }
        if (a.bestBeforeDate && !b.bestBeforeDate) return -1;
        if (!a.bestBeforeDate && b.bestBeforeDate) return 1;
        return a.productName.localeCompare(b.productName);
      });
  }

  async addStock(data: Partial<StockItem>): Promise<StockItem> {
    const id = data.id || `stock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hhId = this.activeHouseholdId() || data.householdId || '';
    const item: StockItem = {
      id,
      householdId: hhId,
      productId: data.productId || '',
      amount: data.amount ?? 1,
      locationId: data.locationId ?? null,
      bestBeforeDate: data.bestBeforeDate ?? null,
      purchasedDate: data.purchasedDate || new Date().toISOString().slice(0, 10),
      price: data.price ?? null,
      isOpen: Boolean(data.isOpen || (data as any).open),
      openedDate: data.openedDate ?? null,
      note: data.note ?? null,
      productName: data.productName || 'Stock Item',
      locationName: data.locationName ?? null,
      productGroupId: data.productGroupId ?? null,
      productPictureFileName: data.productPictureFileName ?? null,
      quName: data.quName ?? null,
      urgency: data.urgency || 'none',
      daysUntilExpiration: data.daysUntilExpiration ?? null,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
    await this.storage.putStockItem(item);
    await this.storage.enqueue({ entity: 'stock', action: 'create', payload: item });
    this.syncService.sync().catch(() => {});
    return item;
  }

  async adjustDate(id: string, data: { explicitDate?: string; days?: number }): Promise<StockItem> {
    const item = await this.storage.getStockItem(id);
    if (item) {
      if (data.explicitDate !== undefined) {
        item.bestBeforeDate = data.explicitDate || null;
      } else if (data.days !== undefined) {
        const base = item.bestBeforeDate ? new Date(item.bestBeforeDate) : new Date();
        base.setDate(base.getDate() + data.days);
        item.bestBeforeDate = base.toISOString().slice(0, 10);
      }
      await this.storage.putStockItem(item);
      await this.storage.enqueue({ entity: 'stock', action: 'update', payload: item });
      this.syncService.sync().catch(() => {});
      return item;
    }
    return { id, bestBeforeDate: data.explicitDate || null } as any;
  }

  async consumeStock(
    id: string,
    amount: number,
    options?: { isSpoiled?: boolean; locationId?: string },
  ): Promise<{ consumed: boolean; remaining: number }> {
    const existing = await this.storage.getStockItem(id);
    if (!existing || amount >= existing.amount) {
      if (existing) {
        await this.storage.deleteStockItem(id);
      }
      await this.storage.enqueue({ entity: 'stock', action: 'delete', payload: { id } });
      this.syncService.sync().catch(() => {});
      return { consumed: true, remaining: 0 };
    }
    existing.amount -= amount;
    if (options?.isSpoiled) {
      existing.note = existing.note ? `${existing.note} (Spoiled)` : 'Spoiled';
    }
    await this.storage.putStockItem(existing);
    await this.storage.enqueue({ entity: 'stock', action: 'update', payload: existing });
    this.syncService.sync().catch(() => {});
    return { consumed: true, remaining: existing.amount };
  }

  async toggleOpen(id: string): Promise<StockItem> {
    const item = await this.storage.getStockItem(id);
    if (item) {
      item.isOpen = !item.isOpen;
      item.openedDate = item.isOpen ? new Date().toISOString().slice(0, 10) : null;
      await this.storage.putStockItem(item);
      await this.storage.enqueue({ entity: 'stock', action: 'update', payload: item });
      this.syncService.sync().catch(() => {});
      return item;
    }
    return { id, isOpen: true } as any;
  }

  async openStock(
    id: string,
    amount = 1,
  ): Promise<{
    openedStockItem: StockItem;
    originalStockItem: StockItem | null;
    split: boolean;
    originalDate: string | null;
    originalLocationId: string | null;
  }> {
    const item = await this.storage.getStockItem(id);
    if (!item) {
      const fallback: StockItem = {
        id,
        householdId: this.activeHouseholdId() || '',
        productId: '',
        productName: 'Stock Item',
        productPictureFileName: null,
        productGroupId: null,
        quName: null,
        bestBeforeDate: null,
        purchasedDate: null,
        price: null,
        locationId: null,
        locationName: null,
        openedDate: null,
        note: null,
        urgency: 'none',
        daysUntilExpiration: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        amount,
        isOpen: true,
      };
      return {
        openedStockItem: fallback,
        originalStockItem: null,
        split: false,
        originalDate: null,
        originalLocationId: null,
      };
    }

    const product = await this.storage.getProduct(item.productId);
    const originalDate = item.bestBeforeDate;
    const originalLocationId = item.locationId;
    const effectiveAmount = Math.max(1, amount);

    let openedLocationId = item.locationId;
    if (product?.moveOnOpen && product.openLocationId) {
      openedLocationId = product.openLocationId;
    }
    let openedBestBeforeDate = item.bestBeforeDate;
    if (product?.defaultBestBeforeDaysAfterOpen && product.defaultBestBeforeDaysAfterOpen > 0) {
      const target = new Date();
      target.setDate(target.getDate() + product.defaultBestBeforeDaysAfterOpen);
      openedBestBeforeDate = target.toISOString().slice(0, 10);
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    if (item.amount <= effectiveAmount) {
      item.isOpen = true;
      item.openedDate = todayStr;
      if (openedLocationId) item.locationId = openedLocationId;
      item.bestBeforeDate = openedBestBeforeDate;
      await this.storage.putStockItem(item);
      await this.storage.enqueue({ entity: 'stock', action: 'update', payload: item });
      this.syncService.sync().catch(() => {});
      return {
        openedStockItem: item,
        originalStockItem: null,
        split: false,
        originalDate,
        originalLocationId,
      };
    }

    // Split batch
    item.amount -= effectiveAmount;
    await this.storage.putStockItem(item);
    await this.storage.enqueue({ entity: 'stock', action: 'update', payload: item });

    const newItem: StockItem = {
      ...item,
      id: `stock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      amount: effectiveAmount,
      isOpen: true,
      openedDate: todayStr,
      locationId: openedLocationId || item.locationId,
      bestBeforeDate: openedBestBeforeDate || item.bestBeforeDate,
    };
    await this.storage.putStockItem(newItem);
    await this.storage.enqueue({ entity: 'stock', action: 'create', payload: newItem });
    this.syncService.sync().catch(() => {});
    return {
      openedStockItem: newItem,
      originalStockItem: item,
      split: true,
      originalDate,
      originalLocationId,
    };
  }

  async revertOpen(data: {
    openedStockItemId: string;
    originalStockItemId?: string | null;
    split: boolean;
    amount: number;
    originalDate: string | null;
    originalLocationId: string | null;
  }): Promise<void> {
    if (data.split) {
      await this.storage.deleteStockItem(data.openedStockItemId);
      await this.storage.enqueue({ entity: 'stock', action: 'delete', payload: { id: data.openedStockItemId } });
      if (data.originalStockItemId) {
        const orig = await this.storage.getStockItem(data.originalStockItemId);
        if (orig) {
          orig.amount += data.amount;
          await this.storage.putStockItem(orig);
          await this.storage.enqueue({ entity: 'stock', action: 'update', payload: orig });
        }
      }
    } else {
      const orig = await this.storage.getStockItem(data.openedStockItemId);
      if (orig) {
        orig.isOpen = false;
        orig.openedDate = null;
        orig.bestBeforeDate = data.originalDate;
        orig.locationId = data.originalLocationId;
        await this.storage.putStockItem(orig);
        await this.storage.enqueue({ entity: 'stock', action: 'update', payload: orig });
      }
    }
    this.syncService.sync().catch(() => {});
  }

  async transferStock(data: {
    productId: string;
    stockItemId?: string;
    fromLocationId?: string;
    toLocationId: string;
    amount: number;
  }): Promise<{ transferred: boolean; targetLocationId?: string }> {
    const hhId = this.activeHouseholdId() || undefined;
    const allStock = await this.storage.getStock(hhId);
    const candidates = allStock.filter(
      (s) => s.productId === data.productId && (!data.fromLocationId || s.locationId === data.fromLocationId),
    );
    const target = (data.stockItemId ? allStock.find((s) => s.id === data.stockItemId) : null) || candidates[0];
    if (target) {
      if (target.amount <= data.amount) {
        target.locationId = data.toLocationId;
        await this.storage.putStockItem(target);
        await this.storage.enqueue({ entity: 'stock', action: 'update', payload: target });
      } else {
        target.amount -= data.amount;
        await this.storage.putStockItem(target);
        await this.storage.enqueue({ entity: 'stock', action: 'update', payload: target });

        const moved: StockItem = {
          ...target,
          id: `stock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          amount: data.amount,
          locationId: data.toLocationId,
        };
        await this.storage.putStockItem(moved);
        await this.storage.enqueue({ entity: 'stock', action: 'create', payload: moved });
      }
      this.syncService.sync().catch(() => {});
      return { transferred: true, targetLocationId: data.toLocationId };
    }
    return { transferred: true };
  }

  async updateStockItem(id: string, data: Partial<StockItem>): Promise<StockItem> {
    const item = await this.storage.getStockItem(id);
    const merged = { ...(item || {}), ...data, id } as StockItem;
    await this.storage.putStockItem(merged);
    await this.storage.enqueue({ entity: 'stock', action: 'update', payload: merged });
    this.syncService.sync().catch(() => {});
    return merged;
  }

  async deleteStockItem(id: string): Promise<void> {
    await this.storage.deleteStockItem(id);
    await this.storage.enqueue({ entity: 'stock', action: 'delete', payload: { id } });
    this.syncService.sync().catch(() => {});
  }

  // Shopping Lists
  async getShoppingLists(): Promise<ShoppingList[]> {
    const hhId = this.activeHouseholdId() || undefined;
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    if (hhId) {
      const isHydrated = await this.syncService.isHouseholdHydrated(hhId);
      const local = await this.storage.getShoppingLists(hhId);
      if (isHydrated && local.length > 0) {
        this.syncService.sync().catch(() => {});
        return local;
      }
      await this.syncService.sync().catch(() => {});
      const refreshed = await this.storage.getShoppingLists(hhId);
      const nowHydrated = await this.syncService.isHouseholdHydrated(hhId);
      if (nowHydrated || (!isOnline && refreshed.length > 0)) {
        return refreshed;
      }
    }
    try {
      const remote = await firstValueFrom(this.http.get<ShoppingList[]>('/api/shopping-list', this.options));
      await this.storage.saveShoppingLists(remote);
      return remote;
    } catch {
      return hhId ? this.storage.getShoppingLists(hhId) : [];
    }
  }

  async getDefaultShoppingList(): Promise<ShoppingList> {
    const lists = await this.getShoppingLists();
    return lists.find((l) => l.isDefault) || lists[0];
  }

  async createShoppingList(data: Partial<ShoppingList>): Promise<ShoppingList> {
    const id = data.id || `list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hhId = this.activeHouseholdId() || data.householdId || '';
    const list: ShoppingList = {
      id,
      householdId: hhId,
      name: data.name || 'Shopping List',
      storeId: data.storeId || null,
      isDefault: data.isDefault || false,
      sortOrder: data.sortOrder ?? 0,
    };
    await this.storage.putShoppingList(list);
    await this.storage.enqueue({ entity: 'shopping_list', action: 'create', payload: list });
    this.syncService.sync().catch(() => {});
    return list;
  }

  async updateShoppingList(id: string, data: Partial<ShoppingList>): Promise<ShoppingList> {
    const list = await this.storage.getShoppingList(id);
    const merged = { ...(list || {}), ...data, id } as ShoppingList;
    await this.storage.putShoppingList(merged);
    await this.storage.enqueue({ entity: 'shopping_list', action: 'update', payload: merged });
    this.syncService.sync().catch(() => {});
    return merged;
  }

  async deleteShoppingList(id: string): Promise<void> {
    await this.storage.deleteShoppingList(id);
    await this.storage.enqueue({ entity: 'shopping_list', action: 'delete', payload: { id } });
    this.syncService.sync().catch(() => {});
  }

  async reorderShoppingLists(listIds: string[]): Promise<void> {
    const updatedLists: ShoppingList[] = [];
    for (let i = 0; i < listIds.length; i++) {
      const list = await this.storage.getShoppingList(listIds[i]);
      if (list) {
        list.sortOrder = i;
        await this.storage.putShoppingList(list);
        updatedLists.push(list);
      }
    }
    await this.storage.enqueue({
      entity: 'shopping_list',
      action: 'update',
      payload: updatedLists.map((l) => ({ id: l.id, sortOrder: l.sortOrder })),
    });
    this.syncService.sync().catch(() => {});
  }

  // Shopping Items
  async getShoppingItems(listId?: string, storeId?: string): Promise<ShoppingListItem[]> {
    const hhId = this.activeHouseholdId() || undefined;
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    if (hhId) {
      const isHydrated = await this.syncService.isHouseholdHydrated(hhId);
      const local = await this.storage.getShoppingItems(listId, hhId);
      if (isHydrated && local.length > 0) {
        this.syncService.sync().catch(() => {});
        return storeId ? local.filter((i) => !i.storeId || i.storeId === storeId) : local;
      }
      await this.syncService.sync().catch(() => {});
      const refreshed = await this.storage.getShoppingItems(listId, hhId);
      const nowHydrated = await this.syncService.isHouseholdHydrated(hhId);
      if (nowHydrated || (!isOnline && refreshed.length > 0)) {
        return storeId ? refreshed.filter((i) => !i.storeId || i.storeId === storeId) : refreshed;
      }
    }
    try {
      const params = new URLSearchParams();
      if (listId) params.set('shoppingListId', listId);
      if (storeId) params.set('storeId', storeId);
      const qs = params.toString();
      const url = qs ? `/api/shopping-list/items?${qs}` : '/api/shopping-list/items';
      const remote = await firstValueFrom(this.http.get<ShoppingListItem[]>(url, this.options));
      await this.storage.saveShoppingItems(remote);
      return remote;
    } catch {
      return hhId ? this.storage.getShoppingItems(listId, hhId) : [];
    }
  }

  async addShoppingItem(data: Partial<ShoppingListItem>): Promise<ShoppingListItem> {
    const id = data.id || `shop-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hhId = this.activeHouseholdId() || data.householdId || '';
    const item: ShoppingListItem = {
      id,
      householdId: hhId,
      shoppingListId: data.shoppingListId || '',
      productId: data.productId || null,
      productName: data.productName || 'Custom Item',
      amount: data.amount ?? 1,
      note: data.note || null,
      done: data.done ?? false,
      storeId: data.storeId || null,
      aisle: data.aisle || null,
      aisleOrder: data.aisleOrder ?? null,
      sortOrder: data.sortOrder ?? 0,
      productPictureFileName: null,
      quId: null,
      quName: null,
      storeName: null,
      estimatedPrice: null,
      currentStock: 0,
      minStockAmount: 0,
      doneAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.storage.putShoppingItem(item);
    await this.storage.enqueue({ entity: 'shopping_item', action: 'create', payload: item });
    this.syncService.sync().catch(() => {});
    return item;
  }

  async updateShoppingItem(id: string, data: Partial<ShoppingListItem>): Promise<ShoppingListItem> {
    const item = await this.storage.getShoppingItem(id);
    const merged = { ...(item || {}), ...data, id } as ShoppingListItem;
    await this.storage.putShoppingItem(merged);
    await this.storage.enqueue({ entity: 'shopping_item', action: 'update', payload: merged });
    this.syncService.sync().catch(() => {});
    return merged;
  }

  async toggleShoppingItemDone(id: string): Promise<ShoppingListItem> {
    const item = await this.storage.getShoppingItem(id);
    if (item) {
      item.done = !item.done;
      item.doneAt = item.done ? new Date().toISOString() : null;
      await this.storage.putShoppingItem(item);
      await this.storage.enqueue({ entity: 'shopping_item', action: 'update', payload: item });
      this.syncService.sync().catch(() => {});
      return item;
    }
    return { id, done: true } as any;
  }

  async deleteShoppingItem(id: string): Promise<void> {
    await this.storage.deleteShoppingItem(id);
    await this.storage.enqueue({ entity: 'shopping_item', action: 'delete', payload: { id } });
    this.syncService.sync().catch(() => {});
  }

  async reorderShoppingItems(itemIds: string[]): Promise<void> {
    for (let i = 0; i < itemIds.length; i++) {
      const item = await this.storage.getShoppingItem(itemIds[i]);
      if (item) {
        item.sortOrder = i;
        await this.storage.putShoppingItem(item);
      }
    }
    await this.storage.enqueue({
      entity: 'shopping_item',
      action: 'reorder',
      payload: itemIds.map((id, sortOrder) => ({ id, sortOrder })),
    });
    this.syncService.sync().catch(() => {});
  }

  async clearDoneShoppingItems(listId?: string): Promise<{ deletedCount: number }> {
    const hhId = this.activeHouseholdId() || undefined;
    const items = await this.storage.getShoppingItems(listId, hhId);
    const doneItems = items.filter((i) => i.done);
    for (const item of doneItems) {
      await this.storage.deleteShoppingItem(item.id);
      await this.storage.enqueue({ entity: 'shopping_item', action: 'delete', payload: { id: item.id } });
    }
    this.syncService.sync().catch(() => {});
    return { deletedCount: doneItems.length };
  }

  async getMissingProducts(): Promise<MissingProduct[]> {
    try {
      return await firstValueFrom(this.http.get<MissingProduct[]>('/api/shopping-list/missing-products', this.options));
    } catch {
      return [];
    }
  }

  async addMissingProducts(shoppingListId?: string, productIds: string[] = []): Promise<{ addedCount: number }> {
    const targetListId = shoppingListId || (await this.getDefaultShoppingList())?.id || '';
    for (const pid of productIds) {
      await this.addShoppingItem({
        shoppingListId: targetListId,
        productId: pid,
        amount: 1,
      });
    }
    return { addedCount: productIds.length };
  }

  // Saved Filters
  getSavedFilters(): Promise<SavedFilter[]> {
    return firstValueFrom(this.http.get<SavedFilter[]>('/api/saved-filters', this.options));
  }

  saveFilter(name: string, filterConfig: any): Promise<SavedFilter> {
    return firstValueFrom(
      this.http.post<SavedFilter>('/api/saved-filters', { name, filterConfig: JSON.stringify(filterConfig) }, this.options),
    );
  }

  deleteSavedFilter(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/saved-filters/${id}`, this.options));
  }

  // Sync Post
  rawSyncPost(payload: any): Promise<any> {
    return firstValueFrom(this.http.post<any>('/api/sync', payload, this.options));
  }

  sync(payload: any): Promise<any> {
    return this.rawSyncPost(payload);
  }

  // Profile & API Keys
  getProfile(): Promise<ProfileDataDto> {
    return firstValueFrom(this.http.get<ProfileDataDto>('/api/profile', this.options));
  }

  createApiKey(name: string): Promise<CreatedApiKeyDto> {
    return firstValueFrom(this.http.post<CreatedApiKeyDto>('/api/profile/api-keys', { name }, this.options));
  }

  revokeApiKey(keyId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/profile/api-keys/${keyId}`, this.options));
  }

  updateProfileSettings(dto: {
    nextExpiringDays?: number;
    quickConsumeTimerSeconds?: number;
    mealieUrl?: string | null;
    mealieApiToken?: string | null;
    notificationEmail?: string | null;
    emailNotificationsEnabled?: boolean;
    notificationTime?: string;
  }): Promise<UserSettingsDto> {
    return firstValueFrom(this.http.put<UserSettingsDto>('/api/profile/settings', dto, this.options));
  }

  testNotification(): Promise<{ ok: boolean; message: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; message: string }>('/api/profile/notifications/test', {}, this.options),
    );
  }

  testMealie(dto: { url: string; token: string }): Promise<MealieTestResultDto> {
    return firstValueFrom(
      this.http.post<MealieTestResultDto>(
        '/api/profile/mealie/test',
        {
          url: dto.url,
          token: dto.token,
          mealieUrl: dto.url,
          mealieApiToken: dto.token,
        },
        this.options,
      ),
    );
  }

  // Mealie Integration
  getMealieStatus(): Promise<{ configured: boolean; mealieUrl: string | null }> {
    return firstValueFrom(this.http.get<{ configured: boolean; mealieUrl: string | null }>('/api/mealie/status', this.options));
  }

  getMealieFoods(refresh = false): Promise<{ items: MealieFoodSummary[]; cachedAt: string; expiresAt: string }> {
    const url = `/api/mealie/foods${refresh ? '?refresh=true' : ''}`;
    return firstValueFrom(this.http.get<{ items: MealieFoodSummary[]; cachedAt: string; expiresAt: string }>(url, this.options));
  }

  getMealieRecipes(refresh = false): Promise<{ items: MealieRecipeSummary[]; cachedAt: string; expiresAt: string }> {
    const url = `/api/mealie/recipes${refresh ? '?refresh=true' : ''}`;
    return firstValueFrom(this.http.get<{ items: MealieRecipeSummary[]; cachedAt: string; expiresAt: string }>(url, this.options));
  }

  getProductMealieRecipes(productId: string, refresh = false): Promise<MealieProductRecipesResponse> {
    const url = `/api/mealie/products/${encodeURIComponent(productId)}/recipes${refresh ? '?refresh=true' : ''}`;
    return firstValueFrom(this.http.get<MealieProductRecipesResponse>(url, this.options));
  }

  // Next Engine (Dashboard)
  async getNext(params?: { householdId?: string; days?: number }): Promise<NextResponseDto> {
    const hhId = params?.householdId || this.activeHouseholdId() || 'default';
    const cached = await this.storage.getDashboardData(hhId);
    if (cached) {
      const hasLegacyItemsWithoutPictureField = [...cached.expired, ...cached.expiringSoon].some(
        (item) => item.productPictureFileName === undefined,
      );
      if (!hasLegacyItemsWithoutPictureField) {
        this.syncService.sync().catch(() => {});
        return cached;
      }
    }

    const stock = await this.storage.getStock(hhId);
    const products = await this.storage.getProducts(hhId);
    if (stock.length > 0 || products.length > 0) {
      const catalogs = await this.storage.getCatalogs(hhId);
      const computed = this.computeNextDataLocally(stock, products, params?.days || 5, catalogs);
      await this.storage.saveDashboardData(hhId, computed);
      this.syncService.sync().catch(() => {});
      return computed;
    }

    try {
      let url = '/api/next';
      const queryParts: string[] = [];
      if (params?.householdId) {
        queryParts.push(`householdId=${encodeURIComponent(params.householdId)}`);
      }
      if (params?.days) {
        queryParts.push(`days=${params.days}`);
      }
      if (queryParts.length > 0) {
        url += `?${queryParts.join('&')}`;
      }
      const remote = await firstValueFrom(this.http.get<NextResponseDto>(url, this.options));
      await this.storage.saveDashboardData(hhId, remote);
      return remote;
    } catch {
      return {
        summary: {
          expiredCount: 0,
          expiringSoonCount: 0,
          totalUniqueProductsInStock: 0,
          totalStockItems: 0,
          configuredDays: params?.days || 5,
        },
        expired: [],
        expiringSoon: [],
        household: { id: hhId, name: 'Home' },
        generatedAt: new Date().toISOString(),
      };
    }
  }

  computeNextDataLocally(
    stockItems: StockItem[],
    products: Product[],
    days = 5,
    catalogs?: { units?: QuantityUnit[]; locations?: Location[] },
  ): NextResponseDto {
    const productMap = new Map(products.map((p) => [p.id, p]));
    const unitMap = new Map((catalogs?.units || []).map((u) => [u.id, u]));
    const locationMap = new Map((catalogs?.locations || []).map((l) => [l.id, l]));

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const targetDate = new Date();
    targetDate.setDate(now.getDate() + days);
    const targetStr = targetDate.toISOString().slice(0, 10);

    const expired: any[] = [];
    const expiringSoon: any[] = [];
    const uniqueProductsInStockSet = new Set<string>();
    let totalStockItems = 0;

    for (const item of stockItems) {
      if (item.amount > 0) {
        uniqueProductsInStockSet.add(item.productId);
        totalStockItems += item.amount;
      }

      if (!item.bestBeforeDate) continue;

      const prod = productMap.get(item.productId);
      const unit = prod?.quStockId ? unitMap.get(prod.quStockId) : null;
      const loc = item.locationId ? locationMap.get(item.locationId) : null;
      const pictureFileNames = Array.isArray(prod?.pictureFileNames) ? prod.pictureFileNames : [];

      const bbd = item.bestBeforeDate;
      const itemDate = new Date(`${bbd}T00:00:00Z`);
      const todayDate = new Date(`${todayStr}T00:00:00Z`);
      const diffMs = itemDate.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      const payloadItem = {
        id: item.id,
        productId: item.productId,
        productName: prod?.name || item.productName || 'Unknown Product',
        productPictureFileName: pictureFileNames[0] ?? item.productPictureFileName ?? null,
        amount: item.amount,
        quantityUnit: unit?.name || 'units',
        location: loc?.name || item.locationName || 'Default Location',
        bestBeforeDate: bbd,
        isOpened: Boolean(item.isOpen),
      };

      if (bbd < todayStr) {
        expired.push({
          ...payloadItem,
          daysOverdue: Math.abs(diffDays),
        });
      } else if (bbd <= targetStr) {
        expiringSoon.push({
          ...payloadItem,
          daysRemaining: diffDays,
        });
      }
    }

    expired.sort((a, b) => b.daysOverdue - a.daysOverdue);
    expiringSoon.sort((a, b) => a.daysRemaining - b.daysRemaining);

    return {
      summary: {
        expiredCount: expired.length,
        expiringSoonCount: expiringSoon.length,
        totalUniqueProductsInStock: uniqueProductsInStockSet.size,
        totalStockItems: Math.round(totalStockItems * 100) / 100,
        configuredDays: days,
      },
      expired,
      expiringSoon,
      household: {
        id: this.activeHouseholdId() || 'hh',
        name: 'Home',
      },
      generatedAt: now.toISOString(),
    };
  }
}
