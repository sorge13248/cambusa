import {
  Location,
  MealPlanEntry,
  Product,
  ProductGroup,
  ProductRating,
  QuantityUnit,
  ShoppingList,
  ShoppingListItem,
  StockItem,
  Store,
} from '../../entities/index.js';

export interface SyncPayloadDto {
  lastSyncAt: string | null;
  changes?: {
    products?: Array<Partial<Product>>;
    productRatings?: Array<Partial<ProductRating>>;
    stock?: Array<Partial<StockItem>>;
    shoppingListItems?: Array<Partial<ShoppingListItem>>;
    shoppingLists?: Array<Partial<ShoppingList>>;
    mealPlanEntries?: Array<Partial<MealPlanEntry>>;
    catalogs?: {
      units?: Array<Partial<QuantityUnit>>;
      groups?: Array<Partial<ProductGroup>>;
      locations?: Array<Partial<Location>>;
      stores?: Array<Partial<Store>>;
    };
    deletions?: Array<{ entityType: string; entityId: string }>;
  };
}

export interface SyncResponseDto {
  syncedAt: string;
  serverChanges: {
    products: Product[];
    productRatings?: ProductRating[];
    stock: StockItem[];
    shoppingListItems: ShoppingListItem[];
    shoppingLists?: ShoppingList[];
    mealPlanEntries?: MealPlanEntry[];
    catalogs: {
      units: QuantityUnit[];
      groups: ProductGroup[];
      locations: Location[];
      stores: Store[];
    };
  };
  tombstones: Array<{ entityType: string; entityId: string; deletedAt: Date }>;
}
