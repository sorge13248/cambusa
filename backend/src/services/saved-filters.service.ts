import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedFilter } from '../entities/index.js';

@Injectable()
export class SavedFiltersService {
  constructor(
    @InjectRepository(SavedFilter)
    private readonly filtersRepository: Repository<SavedFilter>,
  ) {}

  async getFilters(householdId: string): Promise<SavedFilter[]> {
    return this.filtersRepository.find({
      where: { householdId },
      order: { name: 'ASC' },
    });
  }

  async saveFilter(householdId: string, userId: string, name: string, filterConfig: string): Promise<SavedFilter> {
    let filter = await this.filtersRepository.findOne({
      where: { householdId, name: name.trim() },
    });

    if (filter) {
      filter.filterConfig = filterConfig;
      filter.userId = userId;
    } else {
      filter = this.filtersRepository.create({
        householdId,
        userId,
        name: name.trim(),
        filterConfig,
      });
    }

    return this.filtersRepository.save(filter);
  }

  async deleteFilter(id: string, householdId: string): Promise<void> {
    const filter = await this.filtersRepository.findOne({ where: { id, householdId } });
    if (!filter) throw new NotFoundException('Saved filter not found');
    await this.filtersRepository.delete({ id, householdId });
  }
}
