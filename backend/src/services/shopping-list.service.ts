import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Product,
  ProductGroup,
  ProductStore,
  QuantityUnit,
  ShoppingList,
  ShoppingListItem,
  StockItem,
  Store,
  SyncTombstone,
} from '../entities/index.js';

export interface EnrichedShoppingListItemDto {
  id: string;
  householdId: string;
  shoppingListId: string;
  productId: string | null;
  productName: string;
  productPictureFileNames: string[];
  productPictureFileName: string | null;
  earliestExpirationDate: string | null;
  amount: number;
  quId: string | null;
  quName: string | null;
  storeId: string | null;
  storeName: string | null;
  aisle: string | null;
  aisleOrder: number | null;
  sortOrder: number;
  estimatedPrice: number | null;
  currentStock: number;
  minStockAmount: number;
  note: string | null;
  done: boolean;
  doneAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MissingProductDto {
  productId: string;
  productName: string;
  productPictureFileNames: string[];
  productPictureFileName: string | null;
  earliestExpirationDate: string | null;
  currentStock: number;
  minStockAmount: number;
  amountMissing: number;
  quId: string | null;
  quName: string | null;
  preferredStoreId: string | null;
}

@Injectable()
export class ShoppingListService {
  constructor(
    @InjectRepository(ShoppingList)
    private readonly listRepository: Repository<ShoppingList>,
    @InjectRepository(ShoppingListItem)
    private readonly itemsRepository: Repository<ShoppingListItem>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(ProductStore)
    private readonly productStoresRepository: Repository<ProductStore>,
    @InjectRepository(StockItem)
    private readonly stockRepository: Repository<StockItem>,
    @InjectRepository(Store)
    private readonly storesRepository: Repository<Store>,
    @InjectRepository(QuantityUnit)
    private readonly unitsRepository: Repository<QuantityUnit>,
    @InjectRepository(ProductGroup)
    private readonly groupsRepository: Repository<ProductGroup>,
    @InjectRepository(SyncTombstone)
    private readonly tombstonesRepository: Repository<SyncTombstone>,
  ) {}

  async getDefaultList(householdId: string): Promise<ShoppingList> {
    let list = await this.listRepository.findOne({
      where: { householdId, isDefault: true },
    });

    if (!list) {
      list = await this.listRepository.findOne({ where: { householdId } });
    }

    if (!list) {
      list = this.listRepository.create({
        householdId,
        name: 'Weekly Groceries',
        isDefault: true,
      });
      list = await this.listRepository.save(list);
    }

    return list;
  }

  async getLists(householdId: string): Promise<ShoppingList[]> {
    return this.listRepository.find({
      where: { householdId },
      order: { sortOrder: 'ASC', isDefault: 'DESC', name: 'ASC' },
    });
  }

  async reorderLists(householdId: string, listIds: string[]): Promise<void> {
    if (!listIds || listIds.length === 0) return;
    for (let i = 0; i < listIds.length; i++) {
      await this.listRepository.update(
        { id: listIds[i], householdId },
        { sortOrder: i },
      );
    }
  }

  async createList(
    householdId: string,
    data: { name: string; storeId?: string | null; isDefault?: boolean },
  ): Promise<ShoppingList> {
    if (data.isDefault) {
      await this.listRepository.update({ householdId }, { isDefault: false });
    }
    const list = this.listRepository.create({
      householdId,
      name: data.name,
      storeId: data.storeId ?? null,
      isDefault: !!data.isDefault,
    });
    return this.listRepository.save(list);
  }

  async updateList(
    id: string,
    householdId: string,
    data: { name?: string; storeId?: string | null; isDefault?: boolean },
  ): Promise<ShoppingList> {
    const list = await this.listRepository.findOne({ where: { id, householdId } });
    if (!list) throw new NotFoundException('Shopping list not found');

    if (data.isDefault) {
      await this.listRepository.update({ householdId }, { isDefault: false });
      list.isDefault = true;
    } else if (data.isDefault === false) {
      list.isDefault = false;
    }

    if (data.name !== undefined) list.name = data.name;
    if (data.storeId !== undefined) list.storeId = data.storeId;

    return this.listRepository.save(list);
  }

  async deleteList(id: string, householdId: string): Promise<void> {
    const list = await this.listRepository.findOne({ where: { id, householdId } });
    if (!list) throw new NotFoundException('Shopping list not found');

    await this.itemsRepository.delete({ shoppingListId: id, householdId });
    await this.listRepository.delete({ id, householdId });
    await this.tombstonesRepository.save(
      this.tombstonesRepository.create({
        householdId,
        entityType: 'shopping_list',
        entityId: id,
      }),
    );
  }

  async getItems(
    shoppingListId: string,
    householdId: string,
    _filterStoreId?: string,
  ): Promise<EnrichedShoppingListItemDto[]> {
    const items = await this.itemsRepository.find({
      where: { shoppingListId, householdId },
    });

    const list = await this.listRepository.findOne({
      where: { id: shoppingListId, householdId },
    });
    const associatedStoreId = list?.storeId ?? null;

    const products = await this.productsRepository.find({ where: { householdId } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const stores = await this.storesRepository.find({ where: { householdId } });
    const storeMap = new Map(stores.map((s) => [s.id, s]));

    const units = await this.unitsRepository.find({ where: { householdId } });
    const unitMap = new Map(units.map((u) => [u.id, u]));

    const stockItems = await this.stockRepository.find({ where: { householdId } });
    const stockMap = new Map<string, number>();
    const earliestExpMap = new Map<string, string>();
    for (const s of stockItems) {
      stockMap.set(s.productId, (stockMap.get(s.productId) ?? 0) + s.amount);
      if (s.bestBeforeDate && s.bestBeforeDate !== '2999-12-31' && !s.bestBeforeDate.startsWith('2999')) {
        const cur = earliestExpMap.get(s.productId);
        if (!cur || s.bestBeforeDate.localeCompare(cur) < 0) {
          earliestExpMap.set(s.productId, s.bestBeforeDate);
        }
      }
    }

    const productStores = await this.productStoresRepository.find({ where: { householdId } });
    const productStoresMap = new Map<string, ProductStore>();
    const preferredStoreMap = new Map<string, string>();
    for (const ps of productStores) {
      productStoresMap.set(`${ps.productId}:${ps.storeId}`, ps);
      if (ps.isPreferred) {
        preferredStoreMap.set(ps.productId, ps.storeId);
      }
    }

    const enriched: EnrichedShoppingListItemDto[] = items.map((item) => {
      const product = item.productId ? productMap.get(item.productId) : null;

      let aisle: string | null = null;
      let aisleOrder: number | null = null;
      let estimatedPrice: number | null = null;
      let storeIdToUse: string | null = null;

      if (associatedStoreId) {
        // Aisles are strictly used ONLY when that same store is associated with the shopping list being consulted.
        storeIdToUse = associatedStoreId;
        if (product) {
          const ps = productStoresMap.get(`${product.id}:${associatedStoreId}`);
          if (ps && ps.aisle) {
            aisle = ps.aisle;
            aisleOrder = ps.aisleOrder;
          }
          if (ps && ps.averagePrice) {
            estimatedPrice = ps.averagePrice * item.amount;
          }
        }
      } else {
        // No store is associated with this shopping list: store aisles must NEVER be used.
        aisle = null;
        aisleOrder = null;
        storeIdToUse = item.storeId || (product ? preferredStoreMap.get(product.id) : null) || null;
        if (product && storeIdToUse) {
          const ps = productStoresMap.get(`${product.id}:${storeIdToUse}`);
          if (ps && ps.averagePrice) {
            estimatedPrice = ps.averagePrice * item.amount;
          }
        }
      }

      const quId = item.quId || product?.quPurchaseId || product?.quStockId || null;
      const unit = quId ? unitMap.get(quId) : null;
      const picList = Array.isArray(product?.pictureFileNames) ? product.pictureFileNames : [];

      return {
        id: item.id,
        householdId: item.householdId,
        shoppingListId: item.shoppingListId,
        productId: item.productId,
        productName: product?.name ?? item.customName ?? 'Unnamed Item',
        productPictureFileNames: picList,
        productPictureFileName: picList[0] ?? null,
        earliestExpirationDate: product ? (earliestExpMap.get(product.id) ?? null) : null,
        amount: item.amount,
        quId,
        quName: unit?.name ?? null,
        storeId: storeIdToUse ?? null,
        storeName: storeIdToUse ? storeMap.get(storeIdToUse)?.name ?? null : null,
        aisle,
        aisleOrder,
        sortOrder: item.sortOrder ?? 0,
        estimatedPrice,
        currentStock: product ? (stockMap.get(product.id) ?? 0) : 0,
        minStockAmount: product?.minStockAmount ?? 0,
        note: item.note,
        done: item.done,
        doneAt: item.doneAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    // Sort by aisle order, then aisle, then custom sortOrder, then productName
    return enriched.sort((a, b) => {
      // Completed items go below pending items
      if (a.done !== b.done) {
        return a.done ? 1 : -1;
      }

      if (a.aisleOrder !== null && b.aisleOrder !== null && a.aisleOrder !== b.aisleOrder) {
        return a.aisleOrder - b.aisleOrder;
      }

      if (a.aisle && b.aisle && a.aisle !== b.aisle) {
        return a.aisle.localeCompare(b.aisle);
      }

      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }

      return a.productName.localeCompare(b.productName);
    });
  }

  async addItem(householdId: string, data: Partial<ShoppingListItem>): Promise<ShoppingListItem> {
    const list = data.shoppingListId
      ? await this.listRepository.findOne({ where: { id: data.shoppingListId, householdId } })
      : await this.getDefaultList(householdId);

    if (!list) {
      throw new NotFoundException('Shopping list not found');
    }

    const item = this.itemsRepository.create({
      householdId,
      shoppingListId: list.id,
      productId: data.productId ?? null,
      customName: data.customName ?? null,
      amount: data.amount ?? 1,
      quId: data.quId ?? null,
      storeId: data.storeId ?? null,
      note: data.note ?? null,
      done: false,
    });

    return this.itemsRepository.save(item);
  }

  async updateItem(
    id: string,
    householdId: string,
    data: Partial<ShoppingListItem>,
  ): Promise<ShoppingListItem> {
    const item = await this.itemsRepository.findOne({ where: { id, householdId } });
    if (!item) throw new NotFoundException('Shopping list item not found');

    Object.assign(item, data);
    return this.itemsRepository.save(item);
  }

  async toggleDone(id: string, householdId: string): Promise<ShoppingListItem> {
    const item = await this.itemsRepository.findOne({ where: { id, householdId } });
    if (!item) throw new NotFoundException('Shopping list item not found');

    item.done = !item.done;
    item.doneAt = item.done ? new Date() : null;
    return this.itemsRepository.save(item);
  }

  async deleteItem(id: string, householdId: string): Promise<void> {
    const item = await this.itemsRepository.findOne({ where: { id, householdId } });
    if (!item) throw new NotFoundException('Shopping list item not found');

    await this.itemsRepository.delete({ id, householdId });
    await this.tombstonesRepository.save(
      this.tombstonesRepository.create({
        householdId,
        entityType: 'shopping_list_item',
        entityId: id,
      }),
    );
  }

  async clearDoneItems(shoppingListId: string, householdId: string): Promise<{ deletedCount: number }> {
    const doneItems = await this.itemsRepository.find({
      where: { shoppingListId, householdId, done: true },
    });

    if (doneItems.length === 0) return { deletedCount: 0 };

    for (const item of doneItems) {
      await this.itemsRepository.delete({ id: item.id, householdId });
      await this.tombstonesRepository.save(
        this.tombstonesRepository.create({
          householdId,
          entityType: 'shopping_list_item',
          entityId: item.id,
        }),
      );
    }

    return { deletedCount: doneItems.length };
  }

  async getMissingProducts(householdId: string): Promise<MissingProductDto[]> {
    const products = await this.productsRepository.find({
      where: { householdId, active: true },
    });

    const stockItems = await this.stockRepository.find({ where: { householdId } });
    const productMap = new Map(products.map((p) => [p.id, p]));
    const stockMap = new Map<string, number>();
    const earliestExpMap = new Map<string, string>();
    for (const s of stockItems) {
      const prod = productMap.get(s.productId);
      if (prod?.treatOpenedAsOutOfStock && s.isOpen) {
        continue;
      }
      stockMap.set(s.productId, (stockMap.get(s.productId) ?? 0) + s.amount);
      if (s.bestBeforeDate && s.bestBeforeDate !== '2999-12-31' && !s.bestBeforeDate.startsWith('2999')) {
        const cur = earliestExpMap.get(s.productId);
        if (!cur || s.bestBeforeDate.localeCompare(cur) < 0) {
          earliestExpMap.set(s.productId, s.bestBeforeDate);
        }
      }
    }

    const units = await this.unitsRepository.find({ where: { householdId } });
    const unitMap = new Map(units.map((u) => [u.id, u]));

    const productStores = await this.productStoresRepository.find({ where: { householdId } });
    const preferredStoreMap = new Map<string, string>();
    for (const ps of productStores) {
      if (ps.isPreferred) {
        preferredStoreMap.set(ps.productId, ps.storeId);
      }
    }

    const missing: MissingProductDto[] = [];

    for (const p of products) {
      if (p.minStockAmount <= 0) continue;

      const current = stockMap.get(p.id) ?? 0;
      if (current < p.minStockAmount) {
        const amountMissing = Math.round((p.minStockAmount - current) * 100) / 100;
        const quId = p.quPurchaseId || p.quStockId || null;
        const unit = quId ? unitMap.get(quId) : null;
        const picList = Array.isArray(p.pictureFileNames) ? p.pictureFileNames : [];

        missing.push({
          productId: p.id,
          productName: p.name,
          productPictureFileNames: picList,
          productPictureFileName: picList[0] ?? null,
          earliestExpirationDate: earliestExpMap.get(p.id) ?? null,
          currentStock: current,
          minStockAmount: p.minStockAmount,
          amountMissing,
          quId,
          quName: unit?.name ?? null,
          preferredStoreId: preferredStoreMap.get(p.id) ?? null,
        });
      }
    }

    return missing;
  }

  async addMissingProductsToList(
    shoppingListId: string,
    householdId: string,
    targetProductIds?: string[],
  ): Promise<{ addedCount: number }> {
    const missing = await this.getMissingProducts(householdId);
    const selected = targetProductIds && targetProductIds.length > 0
      ? missing.filter((m) => targetProductIds.includes(m.productId))
      : missing;

    let addedCount = 0;

    for (const item of selected) {
      const existing = await this.itemsRepository.findOne({
        where: { shoppingListId, productId: item.productId, householdId, done: false },
      });

      if (existing) {
        existing.amount = Math.max(existing.amount, item.amountMissing);
        await this.itemsRepository.save(existing);
      } else {
        const newItem = this.itemsRepository.create({
          householdId,
          shoppingListId,
          productId: item.productId,
          amount: item.amountMissing,
          quId: item.quId,
          storeId: item.preferredStoreId,
          done: false,
        });
        await this.itemsRepository.save(newItem);
      }
      addedCount++;
    }

    return { addedCount };
  }

  async reorderItems(householdId: string, itemIds: string[]): Promise<void> {
    for (let i = 0; i < itemIds.length; i++) {
      await this.itemsRepository.update({ id: itemIds[i], householdId }, { sortOrder: i + 1 });
    }
  }
}
