import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { compareByName } from '../common/sorting.utils.js';
import { SyncPayloadDto, SyncResponseDto } from '../common/sync/sync.types.js';
import {
  Location,
  Product,
  ProductGroup,
  QuantityUnit,
  ShoppingList,
  ShoppingListItem,
  StockItem,
  Store,
  SyncTombstone,
} from '../entities/index.js';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(StockItem)
    private readonly stockRepository: Repository<StockItem>,
    @InjectRepository(ShoppingListItem)
    private readonly shoppingItemsRepository: Repository<ShoppingListItem>,
    @InjectRepository(ShoppingList)
    private readonly shoppingListsRepository: Repository<ShoppingList>,
    @InjectRepository(QuantityUnit)
    private readonly unitsRepository: Repository<QuantityUnit>,
    @InjectRepository(ProductGroup)
    private readonly groupsRepository: Repository<ProductGroup>,
    @InjectRepository(Location)
    private readonly locationsRepository: Repository<Location>,
    @InjectRepository(Store)
    private readonly storesRepository: Repository<Store>,
    @InjectRepository(SyncTombstone)
    private readonly tombstonesRepository: Repository<SyncTombstone>,
  ) {}

  async sync(householdId: string, payload: SyncPayloadDto): Promise<SyncResponseDto> {
    const serverTime = new Date().toISOString();
    const lastSyncDate = payload.lastSyncAt ? new Date(payload.lastSyncAt) : null;
    const changes = payload.changes ?? {};

    // 1. Ingest client mutations
    if (changes.catalogs?.units) {
      for (const u of changes.catalogs.units) {
        if (!u.id || !u.name) continue;
        const existing = await this.unitsRepository.findOne({ where: { id: u.id, householdId } });
        if (existing) {
          Object.assign(existing, u);
          await this.unitsRepository.save(existing);
        } else {
          await this.unitsRepository.save(this.unitsRepository.create({ ...u, householdId }));
        }
      }
    }

    if (changes.catalogs?.groups) {
      for (const g of changes.catalogs.groups) {
        if (!g.id || !g.name) continue;
        const existing = await this.groupsRepository.findOne({ where: { id: g.id, householdId } });
        if (existing) {
          Object.assign(existing, g);
          await this.groupsRepository.save(existing);
        } else {
          await this.groupsRepository.save(this.groupsRepository.create({ ...g, householdId }));
        }
      }
    }

    if (changes.catalogs?.locations) {
      for (const l of changes.catalogs.locations) {
        if (!l.id || !l.name) continue;
        const existing = await this.locationsRepository.findOne({ where: { id: l.id, householdId } });
        if (existing) {
          Object.assign(existing, l);
          await this.locationsRepository.save(existing);
        } else {
          await this.locationsRepository.save(this.locationsRepository.create({ ...l, householdId }));
        }
      }
    }

    if (changes.catalogs?.stores) {
      for (const s of changes.catalogs.stores) {
        if (!s.id || !s.name) continue;
        const existing = await this.storesRepository.findOne({ where: { id: s.id, householdId } });
        if (existing) {
          Object.assign(existing, s);
          await this.storesRepository.save(existing);
        } else {
          await this.storesRepository.save(this.storesRepository.create({ ...s, householdId }));
        }
      }
    }

    if (changes.products) {
      for (const p of changes.products) {
        if (!p.id || !p.name) continue;
        if (p.cannotBeFrozen) {
          p.defaultBestBeforeDaysAfterFreezing = null;
          p.defaultBestBeforeDaysAfterThawing = null;
        }
        const existing = await this.productsRepository.findOne({ where: { id: p.id, householdId } });
        if (existing) {
          if (p.cannotBeFrozen) {
            existing.defaultBestBeforeDaysAfterFreezing = null;
            existing.defaultBestBeforeDaysAfterThawing = null;
          }
          Object.assign(existing, p);
          await this.productsRepository.save(existing);
        } else {
          await this.productsRepository.save(this.productsRepository.create({ ...p, householdId }));
        }
      }
    }

    if (changes.stock) {
      for (const s of changes.stock) {
        if (!s.id || !s.productId) continue;
        const existing = await this.stockRepository.findOne({ where: { id: s.id, householdId } });
        if (existing) {
          Object.assign(existing, s);
          await this.stockRepository.save(existing);
        } else {
          await this.stockRepository.save(this.stockRepository.create({ ...s, householdId }));
        }
      }
    }

    if (changes.shoppingListItems) {
      for (const item of changes.shoppingListItems) {
        if (!item.id || !item.shoppingListId) continue;
        const existing = await this.shoppingItemsRepository.findOne({ where: { id: item.id, householdId } });
        if (existing) {
          Object.assign(existing, item);
          await this.shoppingItemsRepository.save(existing);
        } else {
          await this.shoppingItemsRepository.save(this.shoppingItemsRepository.create({ ...item, householdId }));
        }
      }
    }

    if (changes.shoppingLists) {
      for (const list of changes.shoppingLists) {
        if (!list.id) continue;
        const existing = await this.shoppingListsRepository.findOne({ where: { id: list.id, householdId } });
        if (existing) {
          Object.assign(existing, list);
          await this.shoppingListsRepository.save(existing);
        } else if (list.name) {
          await this.shoppingListsRepository.save(this.shoppingListsRepository.create({ ...list, householdId }));
        }
      }
    }

    if (changes.deletions && changes.deletions.length > 0) {
      for (const del of changes.deletions) {
        if (!del.entityId || !del.entityType) continue;
        const entityType = del.entityType;
        const id = del.entityId;
        if (entityType === 'stock' || entityType === 'stock_item') {
          await this.stockRepository.delete({ id, householdId });
        } else if (entityType === 'product') {
          await this.productsRepository.delete({ id, householdId });
        } else if (entityType === 'shopping_item') {
          await this.shoppingItemsRepository.delete({ id, householdId });
        } else if (entityType === 'shopping_list') {
          await this.shoppingListsRepository.delete({ id, householdId });
        } else if (entityType === 'unit') {
          await this.unitsRepository.delete({ id, householdId });
        } else if (entityType === 'group') {
          await this.groupsRepository.delete({ id, householdId });
        } else if (entityType === 'location') {
          await this.locationsRepository.delete({ id, householdId });
        } else if (entityType === 'store') {
          await this.storesRepository.delete({ id, householdId });
        }
        await this.tombstonesRepository.save(
          this.tombstonesRepository.create({
            householdId,
            entityType: entityType === 'stock' ? 'stock_item' : entityType,
            entityId: id,
            deletedAt: new Date(),
          }),
        );
      }
    }

    // 2. Query Server Changes & Tombstones since lastSyncDate
    const filter = (_entity?: string) => {
      if (!lastSyncDate) return { householdId };
      return { householdId, updatedAt: MoreThan(lastSyncDate) };
    };

    const serverProducts = await this.productsRepository.find({ where: filter('product') });
    const serverStock = await this.stockRepository.find({ where: filter('stock') });
    const serverShoppingItems = await this.shoppingItemsRepository.find({ where: filter('shopping_item') });
    const serverShoppingLists = await this.shoppingListsRepository.find({
      where: filter('shopping_list'),
      order: { sortOrder: 'ASC', isDefault: 'DESC', name: 'ASC' },
    });
    const serverUnits = (await this.unitsRepository.find({ where: filter('unit') })).sort(compareByName);
    const serverGroups = (await this.groupsRepository.find({ where: filter('group') })).sort(compareByName);
    const serverLocations = (await this.locationsRepository.find({ where: filter('location') })).sort(compareByName);
    const serverStores = (await this.storesRepository.find({ where: filter('store') })).sort(compareByName);

    const tombstones = lastSyncDate
      ? await this.tombstonesRepository.find({
          where: { householdId, deletedAt: MoreThan(lastSyncDate) },
        })
      : [];

    return {
      syncedAt: serverTime,
      serverChanges: {
        products: serverProducts,
        stock: serverStock,
        shoppingListItems: serverShoppingItems,
        shoppingLists: serverShoppingLists,
        catalogs: {
          units: serverUnits,
          groups: serverGroups,
          locations: serverLocations,
          stores: serverStores,
        },
      },
      tombstones: tombstones.map((t) => ({
        entityType: t.entityType,
        entityId: t.entityId,
        deletedAt: t.deletedAt,
      })),
    };
  }
}
