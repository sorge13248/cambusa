import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location, Product, QuantityUnit, StockItem } from '../entities/index.js';
import { AuthUser } from '../common/auth/auth.types.js';
import { HouseholdsService } from './households.service.js';
import { ProfileService } from './profile.service.js';

@Injectable()
export class NextService {
  constructor(
    @InjectRepository(StockItem)
    private readonly stockRepo: Repository<StockItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(QuantityUnit)
    private readonly unitRepo: Repository<QuantityUnit>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly householdsService: HouseholdsService,
    private readonly profileService: ProfileService,
  ) {}

  async getNextData(user: AuthUser, explicitHouseholdId?: string, queryDays?: number) {
    let householdId = explicitHouseholdId?.trim();
    if (!householdId) {
      const defaultHh = await this.householdsService.getDefaultHousehold(user.id);
      householdId = defaultHh?.id;
      if (!householdId) {
        const userHouseholds = await this.householdsService.getUserHouseholds(user.id);
        householdId = userHouseholds[0]?.id;
      }
    }

    if (!householdId) {
      throw new UnauthorizedException('No accessible household found for user');
    }

    const membership = await this.householdsService.verifyMembership(householdId, user.id);
    if (!membership) {
      throw new UnauthorizedException('Access to specified household denied');
    }

    const household = await this.householdsService.getHousehold(householdId);

    let days = queryDays && queryDays > 0 ? queryDays : undefined;
    if (!days) {
      const settings = await this.profileService.getUserSettings(user.id);
      days = settings?.nextExpiringDays || 5;
    }

    const stockItems = await this.stockRepo.find({
      where: { householdId },
      order: { bestBeforeDate: 'ASC' },
    });

    const products = await this.productRepo.find({ where: { householdId } });
    const units = await this.unitRepo.find({ where: { householdId } });
    const locations = await this.locationRepo.find({ where: { householdId } });

    const productMap = new Map(products.map((p) => [p.id, p]));
    const unitMap = new Map(units.map((u) => [u.id, u]));
    const locationMap = new Map(locations.map((l) => [l.id, l]));

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const targetDate = new Date();
    targetDate.setDate(now.getDate() + days);
    const targetStr = targetDate.toISOString().slice(0, 10);

    const expired: any[] = [];
    const expiringSoon: any[] = [];
    const uniqueProductsInStockSet = new Set<string>();
    let totalStockItems = 0;

    for (const item of stockItems) {
      if (item.amount > 0) {
        uniqueProductsInStockSet.add(item.productId);
        totalStockItems += item.amount;
      }

      if (!item.bestBeforeDate) continue;

      const prod = productMap.get(item.productId);
      const unit = prod?.quStockId ? unitMap.get(prod.quStockId) : null;
      const loc = item.locationId ? locationMap.get(item.locationId) : null;

      const bbd = item.bestBeforeDate;
      const itemDate = new Date(`${bbd}T00:00:00Z`);
      const todayDate = new Date(`${todayStr}T00:00:00Z`);
      const diffMs = itemDate.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      const payloadItem = {
        id: item.id,
        productId: item.productId,
        productName: prod?.name || 'Unknown Product',
        amount: item.amount,
        quantityUnit: unit?.name || 'units',
        location: loc?.name || 'Default Location',
        bestBeforeDate: bbd,
        isOpened: Boolean(item.isOpen),
      };

      if (bbd < todayStr) {
        expired.push({
          ...payloadItem,
          daysOverdue: Math.abs(diffDays),
        });
      } else if (bbd <= targetStr) {
        expiringSoon.push({
          ...payloadItem,
          daysRemaining: diffDays,
        });
      }
    }

    expired.sort((a, b) => b.daysOverdue - a.daysOverdue);
    expiringSoon.sort((a, b) => a.daysRemaining - b.daysRemaining);

    return {
      summary: {
        expiredCount: expired.length,
        expiringSoonCount: expiringSoon.length,
        totalUniqueProductsInStock: uniqueProductsInStockSet.size,
        totalStockItems: Math.round(totalStockItems * 100) / 100,
        configuredDays: days,
      },
      expired,
      expiringSoon,
      household: {
        id: household?.id,
        name: household?.name,
      },
      generatedAt: now.toISOString(),
    };
  }
}
