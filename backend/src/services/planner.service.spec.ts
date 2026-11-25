import { describe, expect, it, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import {
  Household,
  HouseholdInvitation,
  HouseholdMember,
  Location,
  MealPlanEntry,
  Product,
  ProductGroup,
  ProductRating,
  ProductStore,
  QuantityUnit,
  SavedFilter,
  ShoppingList,
  ShoppingListItem,
  StockItem,
  Store,
  Aisle,
  SyncTombstone,
  User,
} from '../entities/index.js';
import { PlannerService } from './planner.service.js';
import { SyncService } from './sync.service.js';

describe('PlannerService & MealPlanEntry Sync', () => {
  let dataSource: DataSource;
  let plannerService: PlannerService;
  let syncService: SyncService;
  let householdId: string;
  let otherHouseholdId: string;
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        User,
        Household,
        HouseholdMember,
        HouseholdInvitation,
        QuantityUnit,
        ProductGroup,
        Location,
        Store,
        Aisle,
        Product,
        ProductRating,
        ProductStore,
        StockItem,
        ShoppingList,
        ShoppingListItem,
        SavedFilter,
        MealPlanEntry,
        SyncTombstone,
      ],
      synchronize: true,
    });
    await dataSource.initialize();

    const userRepo = dataSource.getRepository(User);
    const hhRepo = dataSource.getRepository(Household);
    const prodRepo = dataSource.getRepository(Product);
    const mealPlanRepo = dataSource.getRepository(MealPlanEntry);
    const tombstoneRepo = dataSource.getRepository(SyncTombstone);

    const user = await userRepo.save(userRepo.create({ subject: 'sub-alice', email: 'u@test.local', displayName: 'Alice' }));
    userId = user.id;
    const hh1 = await hhRepo.save(hhRepo.create({ name: 'Home 1', ownerId: userId }));
    const hh2 = await hhRepo.save(hhRepo.create({ name: 'Home 2', ownerId: userId }));
    householdId = hh1.id;
    otherHouseholdId = hh2.id;

    const prod = await prodRepo.save(prodRepo.create({ householdId, name: 'Oats' }));
    productId = prod.id;

    plannerService = new PlannerService(mealPlanRepo, tombstoneRepo);
    syncService = new SyncService(
      prodRepo,
      dataSource.getRepository(StockItem),
      dataSource.getRepository(ShoppingListItem),
      dataSource.getRepository(ShoppingList),
      dataSource.getRepository(QuantityUnit),
      dataSource.getRepository(ProductGroup),
      dataSource.getRepository(Location),
      dataSource.getRepository(Store),
      tombstoneRepo,
      dataSource.getRepository(ProductRating),
      mealPlanRepo,
    );
  });

  it('should create, isolate by householdId, and delete entries with tombstones', async () => {
    const entry = await plannerService.createEntry(householdId, userId, {
      date: '2026-11-25',
      mealSlot: 'breakfast',
      productId,
    });
    expect(entry.userId).toBe(userId);
    expect(entry.householdId).toBe(householdId);

    const hh1Entries = await plannerService.getEntries(householdId);
    const hh2Entries = await plannerService.getEntries(otherHouseholdId);
    expect(hh1Entries.length).toBe(1);
    expect(hh2Entries.length).toBe(0);

    await plannerService.deleteEntry(entry.id, householdId);
    expect((await plannerService.getEntries(householdId)).length).toBe(0);

    const tombstones = await dataSource.getRepository(SyncTombstone).find({ where: { householdId } });
    expect(tombstones.some((t) => t.entityType === 'meal_plan_entry' && t.entityId === entry.id)).toBe(true);
  });

  it('should sync mealPlanEntries and deletions via SyncService', async () => {
    const res = await syncService.sync(
      householdId,
      {
        lastSyncAt: null,
        changes: {
          mealPlanEntries: [
            { id: 'mp-sync-1', date: '2026-11-26', mealSlot: 'dinner', productId },
          ],
        },
      },
      userId,
    );

    expect(res.serverChanges.mealPlanEntries?.length).toBe(1);
    expect(res.serverChanges.mealPlanEntries?.[0].userId).toBe(userId);

    const delRes = await syncService.sync(
      householdId,
      {
        lastSyncAt: res.syncedAt,
        changes: {
          deletions: [{ entityType: 'meal_plan_entry', entityId: 'mp-sync-1' }],
        },
      },
      userId,
    );
    expect(delRes.tombstones.some((t) => t.entityType === 'meal_plan_entry' && t.entityId === 'mp-sync-1')).toBe(true);
  });
});
