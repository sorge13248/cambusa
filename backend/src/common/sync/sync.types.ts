import {
  Location,
  Product,
  ProductGroup,
  QuantityUnit,
  ShoppingListItem,
  StockItem,
  Store,
} from '../../entities/index.js';

export interface SyncPayloadDto {
  lastSyncAt: string | null;
  changes?: {
    products?: Array<Partial<Product>>;
    stock?: Array<Partial<StockItem>>;
    shoppingListItems?: Array<Partial<ShoppingListItem>>;
    catalogs?: {
      units?: Array<Partial<QuantityUnit>>;
      groups?: Array<Partial<ProductGroup>>;
      locations?: Array<Partial<Location>>;
      stores?: Array<Partial<Store>>;
    };
  };
}

export interface SyncResponseDto {
  syncedAt: string;
  serverChanges: {
    products: Product[];
    stock: StockItem[];
    shoppingListItems: ShoppingListItem[];
    catalogs: {
      units: QuantityUnit[];
      groups: ProductGroup[];
      locations: Location[];
      stores: Store[];
    };
  };
  tombstones: Array<{ entityType: string; entityId: string; deletedAt: Date }>;
}
