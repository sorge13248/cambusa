import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location, Product, QuantityUnit, StockItem, SyncTombstone } from '../entities/index.js';

export interface EnrichedStockItemDto {
  id: string;
  householdId: string;
  productId: string;
  productName: string;
  productPictureFileNames: string[];
  productPictureFileName: string | null;
  productBarcodes: string[];
  productCannotBeFrozen: boolean;
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
  createdAt: Date;
  updatedAt: Date;
}

export type ExpirationPreset =
  | 'today'
  | 'tomorrow'
  | '+2d'
  | '-2d'
  | '+5d'
  | '-5d'
  | '+7d'
  | '-7d';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockItem)
    private readonly stockRepository: Repository<StockItem>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(Location)
    private readonly locationsRepository: Repository<Location>,
    @InjectRepository(QuantityUnit)
    private readonly unitsRepository: Repository<QuantityUnit>,
    @InjectRepository(SyncTombstone)
    private readonly tombstonesRepository: Repository<SyncTombstone>,
  ) {}

  async getStock(householdId: string, dueSoonDays = 5): Promise<EnrichedStockItemDto[]> {
    const rawItems = await this.stockRepository.find({
      where: { householdId },
    });

    const products = await this.productsRepository.find({ where: { householdId } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const locations = await this.locationsRepository.find({ where: { householdId } });
    const locationMap = new Map(locations.map((l) => [l.id, l]));

    const units = await this.unitsRepository.find({ where: { householdId } });
    const unitMap = new Map(units.map((u) => [u.id, u]));

    const now = new Date();
    const todayStr = this.formatDate(now);

    const enriched = rawItems.map((item) => {
      const product = productMap.get(item.productId);
      const location = item.locationId ? locationMap.get(item.locationId) : null;
      const unit = product?.quStockId ? unitMap.get(product.quStockId) : null;

      let urgency: EnrichedStockItemDto['urgency'] = 'none';
      let daysUntilExpiration: number | null = null;

      let effectiveBestBeforeDate = item.bestBeforeDate;
      if (effectiveBestBeforeDate === '2999-12-31' || (effectiveBestBeforeDate && effectiveBestBeforeDate.startsWith('2999'))) {
        effectiveBestBeforeDate = null;
      }

      if (effectiveBestBeforeDate) {
        const diffMs = new Date(effectiveBestBeforeDate).getTime() - new Date(todayStr).getTime();
        daysUntilExpiration = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

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

      const pictureFileNames = Array.isArray(product?.pictureFileNames) ? product.pictureFileNames : [];

      return {
        id: item.id,
        householdId: item.householdId,
        productId: item.productId,
        productName: product?.name ?? 'Unknown Product',
        productPictureFileNames: pictureFileNames,
        productPictureFileName: pictureFileNames[0] ?? null,
        productBarcodes: Array.isArray(product?.barcodes) ? product.barcodes : [],
        productCannotBeFrozen: product?.cannotBeFrozen ?? false,
        productGroupId: product?.productGroupId ?? null,
        amount: item.amount,
        quName: unit?.name ?? null,
        bestBeforeDate: effectiveBestBeforeDate,
        purchasedDate: item.purchasedDate,
        price: item.price,
        locationId: item.locationId,
        locationName: location?.name ?? null,
        isOpen: item.isOpen,
        openedDate: item.openedDate,
        note: item.note,
        urgency,
        daysUntilExpiration,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    // Default sorting: earliest expiration first, items without expiration date at the end
    return enriched.sort((a, b) => {
      if (a.bestBeforeDate && b.bestBeforeDate) {
        return a.bestBeforeDate.localeCompare(b.bestBeforeDate);
      }
      if (a.bestBeforeDate && !b.bestBeforeDate) return -1;
      if (!a.bestBeforeDate && b.bestBeforeDate) return 1;
      return a.productName.localeCompare(b.productName);
    });
  }

  async addStock(householdId: string, data: Partial<StockItem>): Promise<StockItem> {
    if (!data.productId) throw new BadRequestException('productId is required');
    if (!data.amount || data.amount <= 0) throw new BadRequestException('Positive amount is required');

    const product = await this.productsRepository.findOne({
      where: { id: data.productId, householdId },
    });
    if (!product) throw new NotFoundException('Product not found in this household');

    const targetLocationId = data.locationId ?? product.defaultLocationId ?? null;
    let targetLocation: Location | null = null;
    if (targetLocationId) {
      targetLocation = await this.locationsRepository.findOne({
        where: { id: targetLocationId, householdId },
      });
      if (product.cannotBeFrozen && targetLocation?.isFreezer) {
        throw new BadRequestException('This product is marked as cannot be frozen');
      }
    }

    let bestBeforeDate = data.bestBeforeDate ?? null;
    if (!bestBeforeDate) {
      if (
        targetLocation?.isFreezer &&
        product.defaultBestBeforeDaysAfterFreezing &&
        product.defaultBestBeforeDaysAfterFreezing > 0
      ) {
        const target = new Date();
        target.setDate(target.getDate() + product.defaultBestBeforeDaysAfterFreezing);
        bestBeforeDate = this.formatDate(target);
      } else if (product.defaultBestBeforeDays > 0) {
        const target = new Date();
        target.setDate(target.getDate() + product.defaultBestBeforeDays);
        bestBeforeDate = this.formatDate(target);
      }
    }

    const item = this.stockRepository.create({
      householdId,
      productId: data.productId,
      amount: data.amount,
      bestBeforeDate,
      purchasedDate: data.purchasedDate ?? this.formatDate(new Date()),
      price: data.price ?? null,
      locationId: targetLocationId,
      isOpen: data.isOpen ?? false,
      openedDate: data.openedDate ?? null,
      note: data.note ?? null,
    });

    return this.stockRepository.save(item);
  }

  async adjustDate(
    id: string,
    householdId: string,
    options: { days?: number; preset?: ExpirationPreset; explicitDate?: string },
  ): Promise<StockItem> {
    const item = await this.stockRepository.findOne({ where: { id, householdId } });
    if (!item) throw new NotFoundException('Stock item not found');

    const now = new Date();

    if (options.explicitDate !== undefined) {
      item.bestBeforeDate = options.explicitDate ? options.explicitDate : null;
    } else if (options.preset) {
      switch (options.preset) {
        case 'today':
          item.bestBeforeDate = this.formatDate(now);
          break;
        case 'tomorrow': {
          const t = new Date(now);
          t.setDate(t.getDate() + 1);
          item.bestBeforeDate = this.formatDate(t);
          break;
        }
        case '+2d':
        case '-2d':
        case '+5d':
        case '-5d':
        case '+7d':
        case '-7d': {
          const days = parseInt(options.preset.replace('d', ''), 10);
          const base = item.bestBeforeDate ? new Date(item.bestBeforeDate) : new Date(now);
          base.setDate(base.getDate() + days);
          item.bestBeforeDate = this.formatDate(base);
          break;
        }
      }
    } else if (options.days !== undefined) {
      const base = item.bestBeforeDate ? new Date(item.bestBeforeDate) : new Date(now);
      base.setDate(base.getDate() + options.days);
      item.bestBeforeDate = this.formatDate(base);
    }

    return this.stockRepository.save(item);
  }

  async consumeStock(
    id: string,
    householdId: string,
    amount: number,
    options?: { isSpoiled?: boolean; locationId?: string },
  ): Promise<{ consumed: boolean; remaining: number }> {
    const item = await this.stockRepository.findOne({ where: { id, householdId } });
    if (!item) throw new NotFoundException('Stock item not found');

    if (amount >= item.amount) {
      await this.stockRepository.delete({ id, householdId });
      await this.tombstonesRepository.save(
        this.tombstonesRepository.create({
          householdId,
          entityType: 'stock_item',
          entityId: id,
        }),
      );
      return { consumed: true, remaining: 0 };
    }

    item.amount -= amount;
    if (options?.isSpoiled) {
      item.note = item.note ? `${item.note} (Spoiled)` : 'Spoiled';
    }
    await this.stockRepository.save(item);
    return { consumed: true, remaining: item.amount };
  }

  async toggleOpen(id: string, householdId: string): Promise<StockItem> {
    const item = await this.stockRepository.findOne({ where: { id, householdId } });
    if (!item) throw new NotFoundException('Stock item not found');

    const product = await this.productsRepository.findOne({ where: { id: item.productId, householdId } });

    item.isOpen = !item.isOpen;
    if (item.isOpen) {
      item.openedDate = this.formatDate(new Date());

      // Auto-move on open if configured
      if (product?.moveOnOpen && product.openLocationId) {
        item.locationId = product.openLocationId;
      }

      // Adjust best before days after opening if configured
      if (product?.defaultBestBeforeDaysAfterOpen && product.defaultBestBeforeDaysAfterOpen > 0) {
        const target = new Date();
        target.setDate(target.getDate() + product.defaultBestBeforeDaysAfterOpen);
        item.bestBeforeDate = this.formatDate(target);
      }
    } else {
      item.openedDate = null;
    }
    return this.stockRepository.save(item);
  }

  async openStock(
    id: string,
    householdId: string,
    amount = 1,
  ): Promise<{
    openedStockItem: StockItem;
    originalStockItem: StockItem | null;
    split: boolean;
    originalDate: string | null;
    originalLocationId: string | null;
  }> {
    const item = await this.stockRepository.findOne({ where: { id, householdId } });
    if (!item) throw new NotFoundException('Stock item not found');

    const product = await this.productsRepository.findOne({ where: { id: item.productId, householdId } });

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
      openedBestBeforeDate = this.formatDate(target);
    }

    const todayStr = this.formatDate(new Date());

    if (item.amount <= effectiveAmount) {
      item.isOpen = true;
      item.openedDate = todayStr;
      item.locationId = openedLocationId;
      item.bestBeforeDate = openedBestBeforeDate;
      const saved = await this.stockRepository.save(item);
      return {
        openedStockItem: saved,
        originalStockItem: null,
        split: false,
        originalDate,
        originalLocationId,
      };
    }

    // Split batch: decrement original and create a new 1-unit open batch
    item.amount -= effectiveAmount;
    const savedOriginal = await this.stockRepository.save(item);

    const newItem = this.stockRepository.create({
      householdId,
      productId: item.productId,
      amount: effectiveAmount,
      bestBeforeDate: openedBestBeforeDate,
      purchasedDate: item.purchasedDate,
      price: item.price,
      locationId: openedLocationId,
      note: item.note,
      isOpen: true,
      openedDate: todayStr,
    });
    const savedOpened = await this.stockRepository.save(newItem);

    return {
      openedStockItem: savedOpened,
      originalStockItem: savedOriginal,
      split: true,
      originalDate,
      originalLocationId,
    };
  }

  async revertOpen(
    householdId: string,
    data: {
      openedStockItemId: string;
      originalStockItemId?: string | null;
      split: boolean;
      amount?: number;
      originalDate?: string | null;
      originalLocationId?: string | null;
    },
  ): Promise<{ reverted: boolean }> {
    const openedItem = await this.stockRepository.findOne({
      where: { id: data.openedStockItemId, householdId },
    });

    const amount = data.amount || 1;

    if (data.split) {
      if (openedItem) {
        await this.stockRepository.delete({ id: openedItem.id, householdId });
        await this.tombstonesRepository.save(
          this.tombstonesRepository.create({
            householdId,
            entityType: 'stock_item',
            entityId: openedItem.id,
          }),
        );
      }

      if (data.originalStockItemId) {
        const originalItem = await this.stockRepository.findOne({
          where: { id: data.originalStockItemId, householdId },
        });
        if (originalItem) {
          originalItem.amount += amount;
          await this.stockRepository.save(originalItem);
        }
      }
      return { reverted: true };
    }

    if (openedItem) {
      openedItem.isOpen = false;
      openedItem.openedDate = null;
      openedItem.bestBeforeDate = data.originalDate ?? openedItem.bestBeforeDate;
      openedItem.locationId = data.originalLocationId ?? openedItem.locationId;
      await this.stockRepository.save(openedItem);
    }
    return { reverted: true };
  }

  async transferStock(
    householdId: string,
    data: {
      stockItemId?: string;
      productId: string;
      fromLocationId?: string | null;
      toLocationId: string;
      amount: number;
    },
  ): Promise<{ transferred: boolean; targetStockItem: StockItem }> {
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('Positive amount is required');
    }

    const product = await this.productsRepository.findOne({
      where: { id: data.productId, householdId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const toLocation = await this.locationsRepository.findOne({
      where: { id: data.toLocationId, householdId },
    });
    if (!toLocation) throw new NotFoundException('Target location not found');

    // Constraint: cannot be frozen
    if (toLocation.isFreezer && product.cannotBeFrozen) {
      throw new BadRequestException('This product is marked as cannot be frozen');
    }

    let sourceItem: StockItem | null = null;
    if (data.stockItemId) {
      sourceItem = await this.stockRepository.findOne({
        where: { id: data.stockItemId, householdId },
      });
      if (!sourceItem) throw new NotFoundException('Source stock item not found');
    } else {
      // Find oldest batch of this product in fromLocationId (or first available)
      const query: any = { householdId, productId: data.productId };
      if (data.fromLocationId) query.locationId = data.fromLocationId;
      sourceItem = await this.stockRepository.findOne({
        where: query,
        order: { bestBeforeDate: 'ASC' },
      });
      if (!sourceItem) throw new NotFoundException('No stock item found to transfer');
    }

    const fromLocation = sourceItem.locationId
      ? await this.locationsRepository.findOne({ where: { id: sourceItem.locationId, householdId } })
      : null;

    // Recalculate expiration date if transitioning to/from freezer
    let updatedBestBeforeDate = sourceItem.bestBeforeDate;
    if (!fromLocation?.isFreezer && toLocation.isFreezer && product.defaultBestBeforeDaysAfterFreezing) {
      const target = new Date();
      target.setDate(target.getDate() + product.defaultBestBeforeDaysAfterFreezing);
      updatedBestBeforeDate = this.formatDate(target);
    } else if (fromLocation?.isFreezer && !toLocation.isFreezer && product.defaultBestBeforeDaysAfterThawing) {
      const target = new Date();
      target.setDate(target.getDate() + product.defaultBestBeforeDaysAfterThawing);
      updatedBestBeforeDate = this.formatDate(target);
    }

    let targetItem: StockItem;
    if (data.amount >= sourceItem.amount) {
      // Move entire source item to target location
      sourceItem.locationId = toLocation.id;
      sourceItem.bestBeforeDate = updatedBestBeforeDate;
      targetItem = await this.stockRepository.save(sourceItem);
    } else {
      // Split quantity
      sourceItem.amount -= data.amount;
      await this.stockRepository.save(sourceItem);

      targetItem = this.stockRepository.create({
        householdId,
        productId: product.id,
        amount: data.amount,
        bestBeforeDate: updatedBestBeforeDate,
        purchasedDate: sourceItem.purchasedDate,
        price: sourceItem.price,
        locationId: toLocation.id,
        isOpen: sourceItem.isOpen,
        openedDate: sourceItem.openedDate,
        note: sourceItem.note,
      });
      targetItem = await this.stockRepository.save(targetItem);
    }

    return { transferred: true, targetStockItem: targetItem };
  }

  async updateStock(
    id: string,
    householdId: string,
    data: {
      amount?: number;
      bestBeforeDate?: string | null;
      purchasedDate?: string | null;
      price?: number | null;
      locationId?: string | null;
      note?: string | null;
      isOpen?: boolean;
      openedDate?: string | null;
    },
  ): Promise<StockItem> {
    const item = await this.stockRepository.findOne({ where: { id, householdId } });
    if (!item) throw new NotFoundException('Stock item not found');

    if (data.locationId !== undefined && data.locationId !== item.locationId) {
      if (data.locationId) {
        const location = await this.locationsRepository.findOne({
          where: { id: data.locationId, householdId },
        });
        if (!location) throw new NotFoundException('Target location not found');

        const product = await this.productsRepository.findOne({
          where: { id: item.productId, householdId },
        });
        if (location.isFreezer && product?.cannotBeFrozen) {
          throw new BadRequestException('This product is marked as cannot be frozen');
        }
      }
      item.locationId = data.locationId;
    }

    if (data.amount !== undefined) {
      if (data.amount <= 0) {
        throw new BadRequestException('Amount must be positive');
      }
      item.amount = data.amount;
    }

    if (data.bestBeforeDate !== undefined) {
      let bbd = data.bestBeforeDate;
      if (bbd === '2999-12-31' || (bbd && bbd.startsWith('2999'))) {
        bbd = null;
      }
      item.bestBeforeDate = bbd;
    }

    if (data.purchasedDate !== undefined) {
      item.purchasedDate = data.purchasedDate;
    }

    if (data.price !== undefined) {
      item.price = data.price;
    }

    if (data.note !== undefined) {
      item.note = data.note;
    }

    if (data.isOpen !== undefined) {
      item.isOpen = data.isOpen;
      if (data.isOpen && !item.openedDate) {
        item.openedDate = data.openedDate || this.formatDate(new Date());
      } else if (!data.isOpen) {
        item.openedDate = null;
      }
    }

    if (data.openedDate !== undefined && item.isOpen) {
      item.openedDate = data.openedDate;
    }

    return this.stockRepository.save(item);
  }

  async deleteStock(id: string, householdId: string): Promise<void> {
    const item = await this.stockRepository.findOne({ where: { id, householdId } });
    if (!item) throw new NotFoundException('Stock item not found');

    await this.stockRepository.delete({ id, householdId });
    await this.tombstonesRepository.save(
      this.tombstonesRepository.create({ householdId, entityType: 'stock_item', entityId: id }),
    );
  }

  private formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
