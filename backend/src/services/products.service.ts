import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { In, Repository } from 'typeorm';
import {
  HouseholdMember,
  Location,
  Product,
  ProductRating,
  ProductStore,
  StockItem,
  SyncTombstone,
  User,
} from '../entities/index.js';
import { resolveUploadsDir } from '../load-env.js';
import { MealieService } from './mealie.service.js';

export interface ProductMemberRatingDto {
  userId: string;
  displayName: string;
  pictureUrl: string | null;
  rating: number | null;
  updatedAt: Date | null;
}

export interface ProductRatingsResponseDto {
  productId: string;
  memberCount: number;
  myRating: number | null;
  otherMembersRatings: ProductMemberRatingDto[];
}

export interface ProductDetailDto extends Product {
  ancestors: Array<{ id: string; name: string }>;
  hierarchyPath: string;
  directStockAmount: number;
  aggregatedStockAmount: number;
  stores: ProductStore[];
}

@Injectable()
export class ProductsService {
  private readonly uploadsDir: string;

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(ProductStore)
    private readonly productStoresRepository: Repository<ProductStore>,
    @InjectRepository(StockItem)
    private readonly stockRepository: Repository<StockItem>,
    @InjectRepository(SyncTombstone)
    private readonly tombstonesRepository: Repository<SyncTombstone>,
    @Optional()
    @InjectRepository(Location)
    private readonly locationsRepository?: Repository<Location>,
    @Optional()
    private readonly mealieService?: MealieService,
    @Optional()
    @InjectRepository(ProductRating)
    private readonly productRatingsRepository?: Repository<ProductRating>,
    @Optional()
    @InjectRepository(HouseholdMember)
    private readonly householdMembersRepository?: Repository<HouseholdMember>,
    @Optional()
    @InjectRepository(User)
    private readonly usersRepository?: Repository<User>,
  ) {
    this.uploadsDir = resolveUploadsDir();
  }

  async getProducts(householdId: string, includeInactive = false): Promise<ProductDetailDto[]> {
    const whereCondition: any = { householdId };
    if (!includeInactive) {
      whereCondition.active = true;
    }
    const products = await this.productsRepository.find({
      where: whereCondition,
      order: { name: 'ASC' },
    });

    const stockItems = await this.stockRepository.find({
      where: { householdId },
    });

    const productStores = await this.productStoresRepository.find({
      where: { householdId },
      order: { aisleOrder: 'ASC' },
    });

    const stockByProduct = new Map<string, number>();
    for (const item of stockItems) {
      stockByProduct.set(item.productId, (stockByProduct.get(item.productId) ?? 0) + item.amount);
    }

    const sortProductStores = (list: ProductStore[]) =>
      list.sort((a, b) => {
        const orderA = a.aisleOrder !== null && a.aisleOrder !== undefined ? Number(a.aisleOrder) : Number.MAX_SAFE_INTEGER;
        const orderB = b.aisleOrder !== null && b.aisleOrder !== undefined ? Number(b.aisleOrder) : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return (a.aisle ?? '').localeCompare(b.aisle ?? '', undefined, { sensitivity: 'base' });
      });

    const storesByProduct = new Map<string, ProductStore[]>();
    for (const ps of productStores) {
      const list = storesByProduct.get(ps.productId) ?? [];
      list.push(ps);
      storesByProduct.set(ps.productId, list);
    }
    for (const list of storesByProduct.values()) {
      sortProductStores(list);
    }

    const productMap = new Map<string, Product>();
    for (const p of products) {
      productMap.set(p.id, p);
    }

    return products.map((p) => {
      const ancestors = this.resolveAncestors(p.id, productMap);
      const hierarchyPath = [...ancestors.map((a) => a.name), p.name].join(' > ');
      const directStockAmount = stockByProduct.get(p.id) ?? 0;
      const aggregatedStockAmount = this.calculateAggregatedStock(p.id, productMap, stockByProduct);
      const stores = storesByProduct.get(p.id) ?? [];

      return {
        ...p,
        ancestors,
        hierarchyPath,
        directStockAmount,
        aggregatedStockAmount,
        stores,
      };
    });
  }

  async getProductById(id: string, householdId: string): Promise<ProductDetailDto> {
    const product = await this.productsRepository.findOne({
      where: { id, householdId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const allProducts = await this.productsRepository.find({
      where: { householdId },
    });
    const productMap = new Map<string, Product>();
    for (const p of allProducts) {
      productMap.set(p.id, p);
    }

    const stockItems = await this.stockRepository.find({
      where: { householdId },
    });
    const stockByProduct = new Map<string, number>();
    for (const item of stockItems) {
      stockByProduct.set(item.productId, (stockByProduct.get(item.productId) ?? 0) + item.amount);
    }

    const rawStores = await this.productStoresRepository.find({
      where: { productId: id, householdId },
      order: { aisleOrder: 'ASC' },
    });
    const stores = [...rawStores].sort((a, b) => {
      const orderA = a.aisleOrder !== null && a.aisleOrder !== undefined ? Number(a.aisleOrder) : Number.MAX_SAFE_INTEGER;
      const orderB = b.aisleOrder !== null && b.aisleOrder !== undefined ? Number(b.aisleOrder) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.aisle ?? '').localeCompare(b.aisle ?? '', undefined, { sensitivity: 'base' });
    });

    const ancestors = this.resolveAncestors(product.id, productMap);
    const hierarchyPath = [...ancestors.map((a) => a.name), product.name].join(' > ');
    const directStockAmount = stockByProduct.get(product.id) ?? 0;
    const aggregatedStockAmount = this.calculateAggregatedStock(product.id, productMap, stockByProduct);

    return {
      ...product,
      ancestors,
      hierarchyPath,
      directStockAmount,
      aggregatedStockAmount,
      stores,
    };
  }

  async createProduct(householdId: string, data: Partial<Product>): Promise<Product> {
    if (data.parentProductId) {
      await this.validateParentProduct(data.parentProductId, null, householdId);
    }

    if (data.cannotBeFrozen) {
      data.defaultBestBeforeDaysAfterFreezing = null;
      data.defaultBestBeforeDaysAfterThawing = null;

      if (data.defaultLocationId && this.locationsRepository) {
        const defLoc = await this.locationsRepository.findOne({
          where: { id: data.defaultLocationId, householdId },
        });
        if (defLoc?.isFreezer) {
          throw new BadRequestException('Cannot set default location to a freezer for a product marked as cannot be frozen');
        }
      }

      if (data.openLocationId && this.locationsRepository) {
        const openLoc = await this.locationsRepository.findOne({
          where: { id: data.openLocationId, householdId },
        });
        if (openLoc?.isFreezer) {
          throw new BadRequestException('Cannot set open location to a freezer for a product marked as cannot be frozen');
        }
      }
    }

    const product = this.productsRepository.create({
      ...data,
      householdId,
    });
    return this.productsRepository.save(product);
  }

  async updateProduct(id: string, householdId: string, data: Partial<Product>): Promise<Product> {
    const product = await this.productsRepository.findOne({ where: { id, householdId } });
    if (!product) throw new NotFoundException('Product not found');

    if (data.parentProductId !== undefined && data.parentProductId !== product.parentProductId) {
      if (data.parentProductId) {
        await this.validateParentProduct(data.parentProductId, id, householdId);
      }
    }

    const cannotBeFrozen = data.cannotBeFrozen !== undefined ? !!data.cannotBeFrozen : product.cannotBeFrozen;
    if (cannotBeFrozen) {
      data.defaultBestBeforeDaysAfterFreezing = null;
      data.defaultBestBeforeDaysAfterThawing = null;
      product.defaultBestBeforeDaysAfterFreezing = null;
      product.defaultBestBeforeDaysAfterThawing = null;

      const targetDefLocId = data.defaultLocationId !== undefined ? data.defaultLocationId : product.defaultLocationId;
      if (targetDefLocId && this.locationsRepository) {
        const defLoc = await this.locationsRepository.findOne({
          where: { id: targetDefLocId, householdId },
        });
        if (defLoc?.isFreezer) {
          throw new BadRequestException('Cannot set default location to a freezer for a product marked as cannot be frozen');
        }
      }

      const targetOpenLocId = data.openLocationId !== undefined ? data.openLocationId : product.openLocationId;
      if (targetOpenLocId && this.locationsRepository) {
        const openLoc = await this.locationsRepository.findOne({
          where: { id: targetOpenLocId, householdId },
        });
        if (openLoc?.isFreezer) {
          throw new BadRequestException('Cannot set open location to a freezer for a product marked as cannot be frozen');
        }
      }

      if (this.locationsRepository) {
        const existingStock = await this.stockRepository.find({ where: { productId: id, householdId } });
        for (const s of existingStock) {
          if (s.locationId) {
            const loc = await this.locationsRepository.findOne({ where: { id: s.locationId, householdId } });
            if (loc?.isFreezer) {
              throw new BadRequestException('Cannot mark product as cannot be frozen while items exist in a freezer location');
            }
          }
        }
      }
    }

    Object.assign(product, data);
    const saved = await this.productsRepository.save(product);
    this.mealieService?.clearProductCache(id);
    return saved;
  }

  async deleteProduct(id: string, householdId: string): Promise<void> {
    const product = await this.productsRepository.findOne({ where: { id, householdId } });
    if (!product) throw new NotFoundException('Product not found');

    await this.productsRepository.delete({ id, householdId });
    this.mealieService?.clearProductCache(id);
    await this.tombstonesRepository.save(
      this.tombstonesRepository.create({ householdId, entityType: 'product', entityId: id }),
    );

    if (product.pictureFileNames && product.pictureFileNames.length > 0) {
      for (const fileName of product.pictureFileNames) {
        try {
          const filePath = join(this.uploadsDir, 'products', fileName);
          await unlink(filePath);
        } catch {
          // ignore missing file
        }
      }
    }
  }

  // Multi-Store Relations
  async getProductStores(productId: string, householdId: string): Promise<ProductStore[]> {
    return this.productStoresRepository.find({
      where: { productId, householdId },
      order: { aisleOrder: 'ASC' },
    });
  }

  async setProductStore(
    productId: string,
    storeId: string,
    householdId: string,
    data: { aisle?: string | null; aisleOrder?: number | null; averagePrice?: number | null; isPreferred?: boolean },
  ): Promise<ProductStore> {
    let ps = await this.productStoresRepository.findOne({
      where: { productId, storeId, householdId },
    });

    if (!ps) {
      ps = this.productStoresRepository.create({
        productId,
        storeId,
        householdId,
        ...data,
      });
    } else {
      Object.assign(ps, data);
    }

    const saved = await this.productStoresRepository.save(ps);
    await this.productsRepository.update({ id: productId, householdId }, { updatedAt: new Date() });
    return saved;
  }

  async removeProductStore(productId: string, storeId: string, householdId: string): Promise<void> {
    await this.productStoresRepository.delete({ productId, storeId, householdId });
    await this.productsRepository.update({ id: productId, householdId }, { updatedAt: new Date() });
  }

  // Image Upload Processing
  async saveProductPicture(productId: string, householdId: string, buffer: Buffer): Promise<string> {
    const product = await this.productsRepository.findOne({ where: { id: productId, householdId } });
    if (!product) throw new NotFoundException('Product not found');

    const productsDir = join(this.uploadsDir, 'products');
    await mkdir(productsDir, { recursive: true });

    const webpBuffer = await sharp(buffer)
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const timestamp = Date.now();
    const fileName = `${product.id}-${timestamp}.webp`;
    const filePath = join(productsDir, fileName);
    await writeFile(filePath, webpBuffer);

    const pictures = Array.isArray(product.pictureFileNames) ? [...product.pictureFileNames] : [];
    pictures.push(fileName);
    product.pictureFileNames = pictures;
    await this.productsRepository.save(product);

    return fileName;
  }

  async deleteProductPicture(productId: string, householdId: string, fileName: string): Promise<string[]> {
    const product = await this.productsRepository.findOne({ where: { id: productId, householdId } });
    if (!product) throw new NotFoundException('Product not found');

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
    const pictures = (product.pictureFileNames || []).filter((fn) => fn !== safeName);
    product.pictureFileNames = pictures;
    await this.productsRepository.save(product);

    try {
      const filePath = join(this.uploadsDir, 'products', safeName);
      await unlink(filePath);
    } catch {
      // ignore missing file
    }

    return pictures;
  }

  async reorderProductPictures(productId: string, householdId: string, pictureFileNames: string[]): Promise<string[]> {
    const product = await this.productsRepository.findOne({ where: { id: productId, householdId } });
    if (!product) throw new NotFoundException('Product not found');

    product.pictureFileNames = pictureFileNames;
    await this.productsRepository.save(product);
    return product.pictureFileNames;
  }

  async getProductRatings(
    productId: string,
    householdId: string,
    currentUserId: string,
  ): Promise<ProductRatingsResponseDto> {
    const product = await this.productsRepository.findOne({ where: { id: productId, householdId } });
    if (!product) throw new NotFoundException('Product not found');

    if (!this.productRatingsRepository || !this.householdMembersRepository || !this.usersRepository) {
      return {
        productId,
        memberCount: 1,
        myRating: null,
        otherMembersRatings: [],
      };
    }

    const members = await this.householdMembersRepository.find({ where: { householdId } });
    const memberIds = members.map((m) => m.userId);
    const users = memberIds.length > 0 ? await this.usersRepository.find({ where: { id: In(memberIds) } }) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const ratings = await this.productRatingsRepository.find({
      where: { householdId, productId },
    });
    const ratingByUser = new Map(ratings.map((r) => [r.userId, r]));

    const myRecord = ratingByUser.get(currentUserId);
    const otherMembersRatings: ProductMemberRatingDto[] = members
      .filter((m) => m.userId !== currentUserId)
      .map((m) => {
        const user = userMap.get(m.userId);
        const r = ratingByUser.get(m.userId);
        return {
          userId: m.userId,
          displayName: user?.displayName ?? 'Member',
          pictureUrl: user?.pictureUrl ?? null,
          rating: r?.rating ?? null,
          updatedAt: r?.updatedAt ?? null,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

    return {
      productId,
      memberCount: Math.max(members.length, 1),
      myRating: myRecord?.rating ?? null,
      otherMembersRatings,
    };
  }

  async setProductRating(
    productId: string,
    householdId: string,
    userId: string,
    rating: number | null,
  ): Promise<{ productId: string; userId: string; rating: number | null; updatedAt: Date }> {
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      throw new BadRequestException('Rating must be null or an integer between 1 and 5');
    }

    const product = await this.productsRepository.findOne({ where: { id: productId, householdId } });
    if (!product) throw new NotFoundException('Product not found');

    if (!this.productRatingsRepository) {
      return { productId, userId, rating, updatedAt: new Date() };
    }

    const existing = await this.productRatingsRepository.findOne({
      where: { householdId, productId, userId },
    });

    if (existing) {
      existing.rating = rating;
      const saved = await this.productRatingsRepository.save(existing);
      return {
        productId: saved.productId,
        userId: saved.userId,
        rating: saved.rating,
        updatedAt: saved.updatedAt,
      };
    }

    const created = this.productRatingsRepository.create({
      householdId,
      productId,
      userId,
      rating,
    });
    const saved = await this.productRatingsRepository.save(created);
    return {
      productId: saved.productId,
      userId: saved.userId,
      rating: saved.rating,
      updatedAt: saved.updatedAt,
    };
  }

  // Infinite Hierarchy Helpers
  private resolveAncestors(productId: string, map: Map<string, Product>): Array<{ id: string; name: string }> {
    const ancestors: Array<{ id: string; name: string }> = [];
    let current = map.get(productId);
    const visited = new Set<string>();

    while (current?.parentProductId && !visited.has(current.parentProductId)) {
      visited.add(current.id);
      const parent = map.get(current.parentProductId);
      if (!parent) break;
      ancestors.unshift({ id: parent.id, name: parent.name });
      current = parent;
    }

    return ancestors;
  }

  private calculateAggregatedStock(
    productId: string,
    map: Map<string, Product>,
    stockByProduct: Map<string, number>,
  ): number {
    let total = stockByProduct.get(productId) ?? 0;

    // Find direct children
    for (const p of map.values()) {
      if (p.parentProductId === productId) {
        total += this.calculateAggregatedStock(p.id, map, stockByProduct);
      }
    }

    return total;
  }

  private async validateParentProduct(
    parentProductId: string,
    currentProductId: string | null,
    householdId: string,
  ): Promise<void> {
    if (currentProductId && parentProductId === currentProductId) {
      throw new BadRequestException('A product cannot be its own parent');
    }

    const parent = await this.productsRepository.findOne({
      where: { id: parentProductId, householdId },
    });
    if (!parent) {
      throw new BadRequestException('Parent product does not exist in this household');
    }

    if (currentProductId) {
      // Check for cycles by traversing up from the candidate parent
      let ancestorId: string | null = parent.parentProductId;
      const visited = new Set<string>([currentProductId]);

      while (ancestorId) {
        if (visited.has(ancestorId)) {
          throw new BadRequestException('Cyclic parent product hierarchy detected');
        }
        visited.add(ancestorId);
        const ancestor = await this.productsRepository.findOne({
          where: { id: ancestorId, householdId },
        });
        ancestorId = ancestor?.parentProductId ?? null;
      }
    }
  }
}
