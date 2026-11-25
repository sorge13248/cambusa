import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MealPlanEntry, MealSlot, SyncTombstone } from '../entities/index.js';

@Injectable()
export class PlannerService {
  constructor(
    @InjectRepository(MealPlanEntry)
    private readonly mealPlanRepository: Repository<MealPlanEntry>,
    @InjectRepository(SyncTombstone)
    private readonly tombstonesRepository: Repository<SyncTombstone>,
  ) {}

  async getEntries(householdId: string, startDate?: string, endDate?: string): Promise<MealPlanEntry[]> {
    const where: any = { householdId };
    if (startDate && endDate) {
      where.date = Between(startDate, endDate);
    }
    return this.mealPlanRepository.find({
      where,
      order: { date: 'ASC', sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async createEntry(
    householdId: string,
    userId: string | null,
    data: { id?: string; date: string; mealSlot: MealSlot; productId: string; sortOrder?: number },
  ): Promise<MealPlanEntry> {
    const entry = this.mealPlanRepository.create({
      ...(data.id ? { id: data.id } : {}),
      householdId,
      userId,
      date: data.date,
      mealSlot: data.mealSlot,
      productId: data.productId,
      sortOrder: data.sortOrder ?? 0,
    });
    return this.mealPlanRepository.save(entry);
  }

  async deleteEntry(id: string, householdId: string): Promise<{ deleted: boolean }> {
    const existing = await this.mealPlanRepository.findOne({ where: { id, householdId } });
    if (!existing) {
      throw new NotFoundException('Meal plan entry not found');
    }
    await this.mealPlanRepository.delete({ id, householdId });
    await this.tombstonesRepository.save(
      this.tombstonesRepository.create({
        householdId,
        entityType: 'meal_plan_entry',
        entityId: id,
        deletedAt: new Date(),
      }),
    );
    return { deleted: true };
  }
}
