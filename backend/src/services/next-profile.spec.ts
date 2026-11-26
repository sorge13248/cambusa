import { describe, expect, it, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import {
  ApiKey,
  Household,
  HouseholdMember,
  HouseholdInvitation,
  Location,
  Product,
  ProductGroup,
  ProductStore,
  QuantityUnit,
  SavedFilter,
  ShoppingList,
  ShoppingListItem,
  StockItem,
  Store,
  SyncTombstone,
  User,
  UserSettings,
} from '../entities/index.js';
import { HouseholdsService } from './households.service.js';
import { ProfileService } from './profile.service.js';
import { NextService } from './next.service.js';
import { AuthUser } from '../common/auth/auth.types.js';

describe('ProfileService & NextService', () => {
  let dataSource: DataSource;
  let householdsService: HouseholdsService;
  let profileService: ProfileService;
  let nextService: NextService;

  const testUser: AuthUser = {
    id: 'user-profile-test-1',
    email: 'user@cambusa.test',
    displayName: 'Test User',
    isSuperadmin: false,
  };

  let testHousehold: Household;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        User,
        UserSettings,
        ApiKey,
        Household,
        HouseholdMember,
        HouseholdInvitation,
        QuantityUnit,
        ProductGroup,
        Location,
        Store,
        Product,
        ProductStore,
        StockItem,
        ShoppingList,
        ShoppingListItem,
        SavedFilter,
        SyncTombstone,
      ],
      synchronize: true,
      prepareDatabase: (db: any) => {
        db.pragma('foreign_keys = ON');
      },
    });

    await dataSource.initialize();

    const userRepo = dataSource.getRepository(User);
    await userRepo.save({
      id: testUser.id,
      subject: 'sub-test-123',
      email: testUser.email,
      displayName: testUser.displayName,
    });

    householdsService = new HouseholdsService(
      dataSource.getRepository(Household),
      dataSource.getRepository(HouseholdMember),
      dataSource.getRepository(HouseholdInvitation),
      userRepo,
    );

    profileService = new ProfileService(
      userRepo,
      dataSource.getRepository(ApiKey),
      dataSource.getRepository(UserSettings),
    );

    nextService = new NextService(
      dataSource.getRepository(StockItem),
      dataSource.getRepository(Product),
      dataSource.getRepository(QuantityUnit),
      dataSource.getRepository(Location),
      householdsService,
      profileService,
    );

    testHousehold = await householdsService.createHousehold(testUser.id, 'Test Villa');
  });

  describe('ProfileService', () => {
    it('creates, lists and revokes API keys', async () => {
      const created = await profileService.createApiKey(testUser, 'Home Assistant');
      expect(created.name).toBe('Home Assistant');
      expect(created.rawKey).toMatch(/^cambusa_ak_[0-9a-f]{64}$/);
      expect(created.keyPrefix).toBe(`${created.rawKey.slice(0, 16)}...`);

      const profile = await profileService.getProfileData(testUser);
      expect(profile.apiKeys.length).toBe(1);
      expect(profile.apiKeys[0].id).toBe(created.id);
      expect(profile.apiKeys[0].name).toBe('Home Assistant');
      expect((profile.apiKeys[0] as any).keyHash).toBeUndefined(); // Key hash must not be exposed

      // Verify raw key validation
      const validated = await profileService.validateApiKey(created.rawKey);
      expect(validated).toBeDefined();
      expect(validated?.id).toBe(testUser.id);

      // Revoke
      await profileService.revokeApiKey(testUser, created.id);
      const afterRevoke = await profileService.getProfileData(testUser);
      expect(afterRevoke.apiKeys.length).toBe(0);

      const invalidValidate = await profileService.validateApiKey(created.rawKey);
      expect(invalidValidate).toBeNull();
    });

    it('updates and retrieves user settings', async () => {
      const initial = await profileService.getProfileData(testUser);
      expect(initial.settings.nextExpiringDays).toBe(5);

      const updated = await profileService.updateSettings(testUser, {
        nextExpiringDays: 10,
        mealieUrl: 'https://mealie.local',
        mealieApiToken: 'mealie-secret-token',
      });

      expect(updated.nextExpiringDays).toBe(10);
      expect(updated.mealieUrl).toBe('https://mealie.local');
      expect(updated.mealieLinked).toBe(true);

      const retrieved = await profileService.getUserSettings(testUser.id);
      expect(retrieved?.nextExpiringDays).toBe(10);
      expect(retrieved?.mealieUrl).toBe('https://mealie.local');
    });
  });

  describe('NextService', () => {
    it('returns summary, expiring soon and expired items correctly', async () => {
      const productRepo = dataSource.getRepository(Product);
      const stockRepo = dataSource.getRepository(StockItem);
      const unitRepo = dataSource.getRepository(QuantityUnit);

      const unit = await unitRepo.save({
        householdId: testHousehold.id,
        name: 'Pack',
        namePlural: 'Packs',
      });

      const p1 = await productRepo.save({
        householdId: testHousehold.id,
        name: 'Fresh Milk',
        quStockId: unit.id,
        pictureFileNames: ['milk-thumb.webp'],
      });

      const p2 = await productRepo.save({
        householdId: testHousehold.id,
        name: 'Greek Yogurt',
        quStockId: unit.id,
      });

      const p3 = await productRepo.save({
        householdId: testHousehold.id,
        name: 'Pasta',
        quStockId: unit.id,
      });

      const today = new Date();
      const pastDate = new Date();
      pastDate.setDate(today.getDate() - 3);
      const futureSoonDate = new Date();
      futureSoonDate.setDate(today.getDate() + 2);
      const farFutureDate = new Date();
      farFutureDate.setDate(today.getDate() + 40);

      // Expired item
      await stockRepo.save({
        householdId: testHousehold.id,
        productId: p1.id,
        amount: 2,
        bestBeforeDate: pastDate.toISOString().slice(0, 10),
      });

      // Expiring soon item
      await stockRepo.save({
        householdId: testHousehold.id,
        productId: p2.id,
        amount: 4,
        bestBeforeDate: futureSoonDate.toISOString().slice(0, 10),
      });

      // Safe item (far future)
      await stockRepo.save({
        householdId: testHousehold.id,
        productId: p3.id,
        amount: 5,
        bestBeforeDate: farFutureDate.toISOString().slice(0, 10),
      });

      const nextData = await nextService.getNextData(testUser, testHousehold.id, 5);

      expect(nextData.summary.expiredCount).toBe(1);
      expect(nextData.summary.expiringSoonCount).toBe(1);
      expect(nextData.summary.totalUniqueProductsInStock).toBe(3);
      expect(nextData.summary.totalStockItems).toBe(11); // 2 + 4 + 5

      expect(nextData.expired.length).toBe(1);
      expect(nextData.expired[0].productName).toBe('Fresh Milk');
      expect(nextData.expired[0].productPictureFileName).toBe('milk-thumb.webp');
      expect(nextData.expired[0].daysOverdue).toBe(3);

      expect(nextData.expiringSoon.length).toBe(1);
      expect(nextData.expiringSoon[0].productName).toBe('Greek Yogurt');
      expect(nextData.expiringSoon[0].productPictureFileName).toBeNull();
      expect(nextData.expiringSoon[0].daysRemaining).toBe(2);
    });
  });

  describe('Meal Plan Slot Email Settings', () => {
    it('normalizes default meal plan slot email settings and persists updates', async () => {
      const profile = await profileService.getProfileData(testUser);
      expect(profile.settings.mealPlanEmailSettings.breakfast).toEqual({
        enabled: false,
        time: '07:30',
        onlyIfHasEntries: true,
      });

      const updated = await profileService.updateSettings(testUser, {
        mealPlanEmailSettings: {
          lunch: { enabled: true, time: '12:15', onlyIfHasEntries: false },
        },
      });

      expect(updated.mealPlanEmailSettings.lunch).toEqual({
        enabled: true,
        time: '12:15',
        onlyIfHasEntries: false,
      });
      expect(updated.mealPlanEmailSettings.dinner.enabled).toBe(false);
    });
  });
});
