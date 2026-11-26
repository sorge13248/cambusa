export interface User {
  id: string;
  email: string | null;
  displayName: string;
  pictureUrl: string | null;
}

export interface UserHouseholdSummary {
  id: string;
  name: string;
  role: string;
  isOwner: boolean;
  memberCount: number;
}

export interface HouseholdMemberDto {
  id: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  displayName: string;
  email: string | null;
  pictureUrl: string | null;
  joinedAt: string;
}

export interface HouseholdInvitationDto {
  id: string;
  householdId: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  expiresAt: string;
  createdAt: string;
}

export interface ReceivedInvitationDto {
  id: string;
  householdId: string;
  householdName: string;
  inviterName: string;
  inviterEmail: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface QuantityUnit {
  id: string;
  householdId: string;
  name: string;
  namePlural: string | null;
  description: string | null;
  active: boolean;
}

export interface ProductGroup {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface Location {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  isFreezer: boolean;
  active: boolean;
}

export interface Store {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface Aisle {
  id: string;
  householdId: string;
  storeId: string;
  name: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductStore {
  id?: string;
  householdId?: string;
  productId: string;
  storeId: string;
  aisle: string | null;
  aisleOrder: number | null;
  averagePrice: number | null;
  isPreferred: boolean;
}

export type DueType = 'best_before' | 'use_by';

export interface MealieLinkedFood {
  id: string;
  name: string;
}

export interface MealieLinkedRecipe {
  id: string;
  slug: string;
  name: string;
}

export interface MealieRecipeSummary {
  id: string;
  slug: string;
  name: string;
  totalTime: string | null;
  imageUrl: string | null;
}

export interface MealieFoodSummary {
  id: string;
  name: string;
  description?: string | null;
}

export interface MealieProductRecipesResponse {
  configured: boolean;
  mealieUrl: string | null;
  recipes: MealieRecipeSummary[];
  foods: MealieLinkedFood[];
  cachedAt: string;
  expiresAt: string;
}

export type ProductCustomFieldType = 'string' | 'textarea' | 'int' | 'double' | 'boolean';

export interface ProductCustomField {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  placeholder: string | null;
  type: ProductCustomFieldType;
  defaultValue: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  barcodes: string[];
  pictureFileNames: string[];
  cannotBeFrozen: boolean;
  openLocationId: string | null;
  moveOnOpen: boolean;
  defaultStoreId: string | null;
  dueType: DueType;
  defaultBestBeforeDays: number;
  defaultBestBeforeDaysAfterOpen: number | null;
  defaultBestBeforeDaysAfterFreezing: number | null;
  defaultBestBeforeDaysAfterThawing: number | null;
  minStockAmount: number;
  treatOpenedAsOutOfStock: boolean;
  productGroupId: string | null;
  defaultLocationId: string | null;
  quStockId: string | null;
  quPurchaseId: string | null;
  quFactor: number;
  yukaScore: number | null;
  tastesGood: boolean | null;
  parentProductId: string | null;
  active: boolean;
  customFields?: Record<string, string | number | boolean | null>;
  mealieFoods?: MealieLinkedFood[];
  mealieRecipes?: MealieLinkedRecipe[];
  ancestors?: Array<{ id: string; name: string }>;
  hierarchyPath?: string;
  directStockAmount?: number;
  aggregatedStockAmount?: number;
  stores?: ProductStore[];
}

export interface StockItem {
  id: string;
  householdId: string;
  productId: string;
  productName: string;
  productPictureFileNames?: string[];
  productPictureFileName: string | null;
  productBarcodes?: string[];
  productCannotBeFrozen?: boolean;
  productGroupId: string | null;
  amount: number;
  quName: string | null;
  bestBeforeDate: string | null;
  purchasedDate: string | null;
  price: number | null;
  locationId: string | null;
  locationName: string | null;
  isOpen: boolean;
  openedDate: string | null;
  note: string | null;
  urgency: 'expired' | 'due_soon' | 'approaching' | 'good' | 'none';
  daysUntilExpiration: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingList {
  id: string;
  householdId: string;
  name: string;
  storeId: string | null;
  isDefault: boolean;
  sortOrder?: number;
}

export interface ShoppingListItem {
  id: string;
  householdId: string;
  shoppingListId: string;
  productId: string | null;
  productName: string;
  customName?: string | null;
  productPictureFileNames?: string[];
  productPictureFileName: string | null;
  earliestExpirationDate?: string | null;
  amount: number;
  quId: string | null;
  quName: string | null;
  storeId: string | null;
  storeName: string | null;
  aisle: string | null;
  aisleOrder: number | null;
  sortOrder?: number;
  estimatedPrice: number | null;
  currentStock: number;
  minStockAmount: number;
  note: string | null;
  done: boolean;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MissingProduct {
  productId: string;
  productName: string;
  productPictureFileNames?: string[];
  productPictureFileName: string | null;
  earliestExpirationDate?: string | null;
  currentStock: number;
  minStockAmount: number;
  amountMissing: number;
  quId: string | null;
  quName: string | null;
  preferredStoreId: string | null;
}

export interface SavedFilter {
  id: string;
  householdId: string;
  userId: string;
  name: string;
  filterConfig: string; // JSON
}

export interface FilterConfig {
  productGroupIds?: string[];
  locationIds?: string[];
  status?: 'all' | 'due' | 'overdue' | 'missing' | 'open' | 'out_of_stock';
  sortBy?: 'bestBeforeDate' | 'name' | 'category' | 'amount';
  sortDirection?: 'ASC' | 'DESC';
}

export interface ApiKeyDto {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKeyDto extends ApiKeyDto {
  rawKey: string;
}

export interface MealSlotEmailConfig {
  enabled: boolean;
  time: string;
  onlyIfHasEntries: boolean;
}

export type MealPlanEmailSettingsMap = Record<MealSlot, MealSlotEmailConfig>;

export interface UserSettingsDto {
  nextExpiringDays: number;
  quickConsumeTimerSeconds?: number;
  mealieUrl: string | null;
  mealieLinked: boolean;
  hasMealieToken: boolean;
  notificationEmail: string | null;
  emailNotificationsEnabled: boolean;
  notificationTime: string;
  mealPlanEmailSettings?: MealPlanEmailSettingsMap;
  smtpConfigured: boolean;
}

export interface ProfileDataDto {
  user: User;
  settings: UserSettingsDto;
  apiKeys: ApiKeyDto[];
}

export interface MealieTestResultDto {
  ok: boolean;
  version?: string;
  recipeCount?: number;
  error?: string;
}

export interface NextItemDto {
  id: string;
  productId: string;
  productName: string;
  productPictureFileName?: string | null;
  amount: number;
  quantityUnit: string;
  location: string;
  bestBeforeDate: string;
  isOpened: boolean;
  daysOverdue?: number;
  daysRemaining?: number;
}

export interface NextResponseDto {
  summary: {
    expiredCount: number;
    expiringSoonCount: number;
    totalUniqueProductsInStock: number;
    totalStockItems: number;
    configuredDays: number;
  };
  expired: NextItemDto[];
  expiringSoon: NextItemDto[];
  household: {
    id: string;
    name: string;
  };
  generatedAt: string;
}

export interface ProductMemberRatingDto {
  userId: string;
  displayName: string;
  pictureUrl: string | null;
  rating: number | null;
  updatedAt: string | null;
}

export interface ProductRatingsResponseDto {
  productId: string;
  memberCount: number;
  myRating: number | null;
  otherMembersRatings: ProductMemberRatingDto[];
}

export interface ProductRatingSyncDto {
  id: string;
  householdId: string;
  productId: string;
  userId: string;
  rating: number | null;
  updatedAt?: string;
}

export type MealSlot = 'breakfast' | 'morning_snack' | 'lunch' | 'afternoon_snack' | 'dinner';

export interface MealSlotConfig {
  key: MealSlot;
  label: string;
}

export const MEAL_SLOTS: MealSlotConfig[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'morning_snack', label: 'Morning Snack' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'afternoon_snack', label: 'Afternoon Snack' },
  { key: 'dinner', label: 'Dinner' },
];

export interface MealPlanEntry {
  id: string;
  householdId: string;
  date: string; // YYYY-MM-DD
  mealSlot: MealSlot;
  productId: string;
  userId: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}
