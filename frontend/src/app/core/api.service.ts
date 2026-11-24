import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import {
  FilterConfig,
  HouseholdInvitationDto,
  HouseholdMemberDto,
  Location,
  MissingProduct,
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
  Aisle,
  User,
  UserHouseholdSummary,
  ProfileDataDto,
  CreatedApiKeyDto,
  UserSettingsDto,
  MealieTestResultDto,
  MealieFoodSummary,
  MealieProductRecipesResponse,
  MealieRecipeSummary,
  NextResponseDto,
} from './models.js';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly activeHouseholdId = signal<string | null>(null);

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

  // Catalogs
  getUnits(): Promise<QuantityUnit[]> {
    return firstValueFrom(this.http.get<QuantityUnit[]>('/api/catalogs/units', this.options));
  }

  getQuantityUnits(): Promise<QuantityUnit[]> {
    return this.getUnits();
  }

  createUnit(data: Partial<QuantityUnit>): Promise<QuantityUnit> {
    return firstValueFrom(this.http.post<QuantityUnit>('/api/catalogs/units', data, this.options));
  }

  updateUnit(id: string, data: Partial<QuantityUnit>): Promise<QuantityUnit> {
    return firstValueFrom(this.http.put<QuantityUnit>(`/api/catalogs/units/${id}`, data, this.options));
  }

  deleteUnit(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/catalogs/units/${id}`, this.options));
  }

  getGroups(): Promise<ProductGroup[]> {
    return firstValueFrom(this.http.get<ProductGroup[]>('/api/catalogs/groups', this.options));
  }

  getProductGroups(): Promise<ProductGroup[]> {
    return this.getGroups();
  }

  createGroup(data: Partial<ProductGroup>): Promise<ProductGroup> {
    return firstValueFrom(this.http.post<ProductGroup>('/api/catalogs/groups', data, this.options));
  }

  updateGroup(id: string, data: Partial<ProductGroup>): Promise<ProductGroup> {
    return firstValueFrom(this.http.put<ProductGroup>(`/api/catalogs/groups/${id}`, data, this.options));
  }

  deleteGroup(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/catalogs/groups/${id}`, this.options));
  }

  getLocations(): Promise<Location[]> {
    return firstValueFrom(this.http.get<Location[]>('/api/catalogs/locations', this.options));
  }

  createLocation(data: Partial<Location>): Promise<Location> {
    return firstValueFrom(this.http.post<Location>('/api/catalogs/locations', data, this.options));
  }

  updateLocation(id: string, data: Partial<Location>): Promise<Location> {
    return firstValueFrom(this.http.put<Location>(`/api/catalogs/locations/${id}`, data, this.options));
  }

  deleteLocation(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/catalogs/locations/${id}`, this.options));
  }

  getStores(): Promise<Store[]> {
    return firstValueFrom(this.http.get<Store[]>('/api/catalogs/stores', this.options));
  }

  createStore(data: Partial<Store>): Promise<Store> {
    return firstValueFrom(this.http.post<Store>('/api/catalogs/stores', data, this.options));
  }

  updateStore(id: string, data: Partial<Store>): Promise<Store> {
    return firstValueFrom(this.http.put<Store>(`/api/catalogs/stores/${id}`, data, this.options));
  }

  deleteStore(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/catalogs/stores/${id}`, this.options));
  }

  // Aisles
  getAisles(storeId?: string): Promise<Aisle[]> {
    const params = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
    return firstValueFrom(this.http.get<Aisle[]>(`/api/catalogs/aisles${params}`, this.options));
  }

  getStoreAisles(storeId: string): Promise<Aisle[]> {
    return firstValueFrom(this.http.get<Aisle[]>(`/api/catalogs/stores/${storeId}/aisles`, this.options));
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

  // Products
  getProducts(includeInactive = false): Promise<Product[]> {
    const url = includeInactive ? '/api/products?includeInactive=true' : '/api/products';
    return firstValueFrom(this.http.get<Product[]>(url, this.options));
  }

  getProduct(id: string): Promise<Product> {
    return firstValueFrom(this.http.get<Product>(`/api/products/${id}`, this.options));
  }

  createProduct(data: Partial<Product>): Promise<Product> {
    return firstValueFrom(this.http.post<Product>('/api/products', data, this.options));
  }

  updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    return firstValueFrom(this.http.put<Product>(`/api/products/${id}`, data, this.options));
  }

  deleteProduct(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/products/${id}`, this.options));
  }

  setProductStore(productId: string, storeId: string, data: Partial<ProductStore>): Promise<ProductStore> {
    return firstValueFrom(
      this.http.put<ProductStore>(`/api/products/${productId}/stores/${storeId}`, data, this.options),
    );
  }

  removeProductStore(productId: string, storeId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/products/${productId}/stores/${storeId}`, this.options),
    );
  }

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

  // Stock & Pantry
  getStock(dueSoonDays?: number): Promise<StockItem[]> {
    let url = '/api/stock';
    if (dueSoonDays) {
      url += `?dueSoonDays=${encodeURIComponent(dueSoonDays)}`;
    }
    return firstValueFrom(this.http.get<StockItem[]>(url, this.options));
  }

  addStock(data: Partial<StockItem>): Promise<StockItem> {
    return firstValueFrom(this.http.post<StockItem>('/api/stock', data, this.options));
  }

  updateStockItem(id: string, data: Partial<StockItem>): Promise<StockItem> {
    return firstValueFrom(this.http.put<StockItem>(`/api/stock/${id}`, data, this.options));
  }

  adjustDate(id: string, options: { days?: number; preset?: string; explicitDate?: string }): Promise<StockItem> {
    return firstValueFrom(this.http.post<StockItem>(`/api/stock/${id}/adjust-date`, options, this.options));
  }

  consumeStock(
    id: string,
    amount: number,
    options?: { isSpoiled?: boolean; locationId?: string },
  ): Promise<{ consumed: boolean; remaining: number }> {
    return firstValueFrom(
      this.http.post<{ consumed: boolean; remaining: number }>(
        `/api/stock/${id}/consume`,
        { amount, ...options },
        this.options,
      ),
    );
  }

  transferStock(data: {
    stockItemId?: string;
    productId: string;
    fromLocationId?: string | null;
    toLocationId: string;
    amount: number;
  }): Promise<{ transferred: boolean; targetStockItem: StockItem }> {
    return firstValueFrom(
      this.http.post<{ transferred: boolean; targetStockItem: StockItem }>(
        '/api/stock/transfer',
        data,
        this.options,
      ),
    );
  }

  openStock(
    id: string,
    amount = 1,
  ): Promise<{
    openedStockItem: StockItem;
    originalStockItem: StockItem | null;
    split: boolean;
    originalDate: string | null;
    originalLocationId: string | null;
  }> {
    return firstValueFrom(
      this.http.post<{
        openedStockItem: StockItem;
        originalStockItem: StockItem | null;
        split: boolean;
        originalDate: string | null;
        originalLocationId: string | null;
      }>(`/api/stock/${id}/open`, { amount }, this.options),
    );
  }

  revertOpen(data: {
    openedStockItemId: string;
    originalStockItemId?: string | null;
    split: boolean;
    amount?: number;
    originalDate?: string | null;
    originalLocationId?: string | null;
  }): Promise<{ reverted: boolean }> {
    return firstValueFrom(
      this.http.post<{ reverted: boolean }>(`/api/stock/revert-open`, data, this.options),
    );
  }

  toggleOpen(id: string): Promise<StockItem> {
    return firstValueFrom(this.http.post<StockItem>(`/api/stock/${id}/toggle-open`, {}, this.options));
  }

  deleteStock(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/stock/${id}`, this.options));
  }

  // Shopping List
  getShoppingLists(): Promise<ShoppingList[]> {
    return firstValueFrom(this.http.get<ShoppingList[]>('/api/shopping-list', this.options));
  }

  reorderShoppingLists(listIds: string[]): Promise<void> {
    return firstValueFrom(
      this.http.post<void>('/api/shopping-list/reorder', { listIds }, this.options),
    );
  }

  getDefaultShoppingList(): Promise<ShoppingList> {
    return firstValueFrom(this.http.get<ShoppingList>('/api/shopping-list/default', this.options));
  }

  createShoppingList(data: { name: string; storeId?: string | null; isDefault?: boolean }): Promise<ShoppingList> {
    return firstValueFrom(this.http.post<ShoppingList>('/api/shopping-list', data, this.options));
  }

  updateShoppingList(id: string, data: { name?: string; storeId?: string | null; isDefault?: boolean }): Promise<ShoppingList> {
    return firstValueFrom(this.http.put<ShoppingList>(`/api/shopping-list/${id}`, data, this.options));
  }

  deleteShoppingList(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/shopping-list/${id}`, this.options));
  }

  getShoppingItems(shoppingListId?: string, storeId?: string): Promise<ShoppingListItem[]> {
    let url = '/api/shopping-list/items';
    const params: string[] = [];
    if (shoppingListId) params.push(`shoppingListId=${encodeURIComponent(shoppingListId)}`);
    if (storeId) params.push(`storeId=${encodeURIComponent(storeId)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    return firstValueFrom(this.http.get<ShoppingListItem[]>(url, this.options));
  }

  addShoppingItem(data: Partial<ShoppingListItem>): Promise<ShoppingListItem> {
    return firstValueFrom(this.http.post<ShoppingListItem>('/api/shopping-list/items', data, this.options));
  }

  updateShoppingItem(id: string, data: Partial<ShoppingListItem>): Promise<ShoppingListItem> {
    return firstValueFrom(this.http.put<ShoppingListItem>(`/api/shopping-list/items/${id}`, data, this.options));
  }

  toggleShoppingItemDone(id: string): Promise<ShoppingListItem> {
    return firstValueFrom(this.http.post<ShoppingListItem>(`/api/shopping-list/items/${id}/toggle-done`, {}, this.options));
  }

  deleteShoppingItem(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/shopping-list/items/${id}`, this.options));
  }

  reorderShoppingItems(itemIds: string[]): Promise<void> {
    return firstValueFrom(
      this.http.post<void>('/api/shopping-list/items/reorder', { itemIds }, this.options),
    );
  }

  clearDoneShoppingItems(shoppingListId?: string): Promise<{ deletedCount: number }> {
    let url = '/api/shopping-list/clear-done';
    if (shoppingListId) url += `?shoppingListId=${encodeURIComponent(shoppingListId)}`;
    return firstValueFrom(this.http.delete<{ deletedCount: number }>(url, this.options));
  }

  getMissingProducts(): Promise<MissingProduct[]> {
    return firstValueFrom(this.http.get<MissingProduct[]>('/api/shopping-list/missing-products', this.options));
  }

  addMissingProducts(shoppingListId?: string, productIds?: string[]): Promise<{ addedCount: number }> {
    return firstValueFrom(
      this.http.post<{ addedCount: number }>(
        '/api/shopping-list/add-missing',
        { shoppingListId, productIds },
        this.options,
      ),
    );
  }

  // Saved Filters
  getSavedFilters(): Promise<SavedFilter[]> {
    return firstValueFrom(this.http.get<SavedFilter[]>('/api/saved-filters', this.options));
  }

  saveFilter(name: string, filterConfig: FilterConfig): Promise<SavedFilter> {
    return firstValueFrom(
      this.http.post<SavedFilter>(
        '/api/saved-filters',
        { name, filterConfig: JSON.stringify(filterConfig) },
        this.options,
      ),
    );
  }

  deleteSavedFilter(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/saved-filters/${id}`, this.options));
  }

  // Sync
  sync(payload: any): Promise<any> {
    return firstValueFrom(this.http.post<any>('/api/sync', payload, this.options));
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

  // Mealie Integration Endpoints (4-Hour Cache with Force Refresh)
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

  // Next Engine
  getNext(params?: { householdId?: string; days?: number }): Promise<NextResponseDto> {
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
    return firstValueFrom(this.http.get<NextResponseDto>(url, this.options));
  }
}
