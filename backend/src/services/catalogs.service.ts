import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Aisle, Location, ProductGroup, QuantityUnit, Store, SyncTombstone } from '../entities/index.js';

@Injectable()
export class CatalogsService {
  constructor(
    @InjectRepository(QuantityUnit)
    private readonly unitsRepository: Repository<QuantityUnit>,
    @InjectRepository(ProductGroup)
    private readonly groupsRepository: Repository<ProductGroup>,
    @InjectRepository(Location)
    private readonly locationsRepository: Repository<Location>,
    @InjectRepository(Store)
    private readonly storesRepository: Repository<Store>,
    @InjectRepository(Aisle)
    private readonly aislesRepository: Repository<Aisle>,
    @InjectRepository(SyncTombstone)
    private readonly tombstonesRepository: Repository<SyncTombstone>,
  ) {}

  // Quantity Units
  async getUnits(householdId: string): Promise<QuantityUnit[]> {
    return this.unitsRepository.find({
      where: { householdId, active: true },
      order: { name: 'ASC' },
    });
  }

  async createUnit(householdId: string, data: Partial<QuantityUnit>): Promise<QuantityUnit> {
    const unit = this.unitsRepository.create({ ...data, householdId });
    return this.unitsRepository.save(unit);
  }

  async updateUnit(id: string, householdId: string, data: Partial<QuantityUnit>): Promise<QuantityUnit> {
    const unit = await this.unitsRepository.findOne({ where: { id, householdId } });
    if (!unit) throw new NotFoundException('Unit not found');
    Object.assign(unit, data);
    return this.unitsRepository.save(unit);
  }

  async deleteUnit(id: string, householdId: string): Promise<void> {
    const unit = await this.unitsRepository.findOne({ where: { id, householdId } });
    if (!unit) throw new NotFoundException('Unit not found');
    await this.unitsRepository.delete({ id, householdId });
    await this.tombstonesRepository.save(
      this.tombstonesRepository.create({ householdId, entityType: 'quantity_unit', entityId: id }),
    );
  }

  // Product Groups
  async getGroups(householdId: string): Promise<ProductGroup[]> {
    return this.groupsRepository.find({
      where: { householdId, active: true },
      order: { name: 'ASC' },
    });
  }

  async createGroup(householdId: string, data: Partial<ProductGroup>): Promise<ProductGroup> {
    const group = this.groupsRepository.create({ ...data, householdId });
    return this.groupsRepository.save(group);
  }

  async updateGroup(id: string, householdId: string, data: Partial<ProductGroup>): Promise<ProductGroup> {
    const group = await this.groupsRepository.findOne({ where: { id, householdId } });
    if (!group) throw new NotFoundException('Product group not found');
    Object.assign(group, data);
    return this.groupsRepository.save(group);
  }

  async deleteGroup(id: string, householdId: string): Promise<void> {
    const group = await this.groupsRepository.findOne({ where: { id, householdId } });
    if (!group) throw new NotFoundException('Product group not found');
    await this.groupsRepository.delete({ id, householdId });
    await this.tombstonesRepository.save(
      this.tombstonesRepository.create({ householdId, entityType: 'product_group', entityId: id }),
    );
  }

  // Locations
  async getLocations(householdId: string): Promise<Location[]> {
    return this.locationsRepository.find({
      where: { householdId, active: true },
      order: { name: 'ASC' },
    });
  }

  async createLocation(householdId: string, data: Partial<Location>): Promise<Location> {
    const loc = this.locationsRepository.create({ ...data, householdId });
    return this.locationsRepository.save(loc);
  }

  async updateLocation(id: string, householdId: string, data: Partial<Location>): Promise<Location> {
    const loc = await this.locationsRepository.findOne({ where: { id, householdId } });
    if (!loc) throw new NotFoundException('Location not found');
    Object.assign(loc, data);
    return this.locationsRepository.save(loc);
  }

  async deleteLocation(id: string, householdId: string): Promise<void> {
    const loc = await this.locationsRepository.findOne({ where: { id, householdId } });
    if (!loc) throw new NotFoundException('Location not found');
    await this.locationsRepository.delete({ id, householdId });
    await this.tombstonesRepository.save(
      this.tombstonesRepository.create({ householdId, entityType: 'location', entityId: id }),
    );
  }

  // Stores
  async getStores(householdId: string): Promise<Store[]> {
    return this.storesRepository.find({
      where: { householdId, active: true },
      order: { name: 'ASC' },
    });
  }

  async createStore(householdId: string, data: Partial<Store>): Promise<Store> {
    const store = this.storesRepository.create({ ...data, householdId });
    return this.storesRepository.save(store);
  }

  async updateStore(id: string, householdId: string, data: Partial<Store>): Promise<Store> {
    const store = await this.storesRepository.findOne({ where: { id, householdId } });
    if (!store) throw new NotFoundException('Store not found');
    Object.assign(store, data);
    return this.storesRepository.save(store);
  }

  async deleteStore(id: string, householdId: string): Promise<void> {
    const store = await this.storesRepository.findOne({ where: { id, householdId } });
    if (!store) throw new NotFoundException('Store not found');
    await this.storesRepository.delete({ id, householdId });
    await this.tombstonesRepository.save(
      this.tombstonesRepository.create({ householdId, entityType: 'store', entityId: id }),
    );
  }

  // Aisles
  async getAisles(householdId: string, storeId?: string): Promise<Aisle[]> {
    const where: any = { householdId };
    if (storeId) {
      where.storeId = storeId;
    }
    return this.aislesRepository.find({
      where,
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async getStoreAisles(storeId: string, householdId: string): Promise<Aisle[]> {
    return this.aislesRepository.find({
      where: { storeId, householdId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async createAisle(
    storeId: string,
    householdId: string,
    data: { name: string; sortOrder?: number },
  ): Promise<Aisle> {
    const store = await this.storesRepository.findOne({ where: { id: storeId, householdId } });
    if (!store) throw new NotFoundException('Store not found');

    let order = data.sortOrder;
    if (order === undefined) {
      const highest = await this.aislesRepository.findOne({
        where: { storeId, householdId },
        order: { sortOrder: 'DESC' },
      });
      order = highest ? highest.sortOrder + 1 : 1;
    }

    const aisle = this.aislesRepository.create({
      householdId,
      storeId,
      name: data.name.trim(),
      sortOrder: order,
    });
    return this.aislesRepository.save(aisle);
  }

  async updateAisle(
    id: string,
    householdId: string,
    data: { name?: string; sortOrder?: number },
  ): Promise<Aisle> {
    const aisle = await this.aislesRepository.findOne({ where: { id, householdId } });
    if (!aisle) throw new NotFoundException('Aisle not found');

    if (data.name !== undefined) aisle.name = data.name.trim();
    if (data.sortOrder !== undefined) aisle.sortOrder = data.sortOrder;

    return this.aislesRepository.save(aisle);
  }

  async deleteAisle(id: string, householdId: string): Promise<void> {
    const aisle = await this.aislesRepository.findOne({ where: { id, householdId } });
    if (!aisle) throw new NotFoundException('Aisle not found');

    await this.aislesRepository.delete({ id, householdId });
    await this.tombstonesRepository.save(
      this.tombstonesRepository.create({ householdId, entityType: 'aisle', entityId: id }),
    );
  }

  async reorderStoreAisles(storeId: string, householdId: string, aisleIds: string[]): Promise<Aisle[]> {
    const store = await this.storesRepository.findOne({ where: { id: storeId, householdId } });
    if (!store) throw new NotFoundException('Store not found');

    const aisles = await this.aislesRepository.find({ where: { storeId, householdId } });
    const aisleMap = new Map(aisles.map((a) => [a.id, a]));

    const updated: Aisle[] = [];
    for (let i = 0; i < aisleIds.length; i++) {
      const id = aisleIds[i];
      const aisle = aisleMap.get(id);
      if (aisle) {
        aisle.sortOrder = i + 1;
        updated.push(aisle);
      }
    }

    if (updated.length > 0) {
      await this.aislesRepository.save(updated);
    }

    return this.getStoreAisles(storeId, householdId);
  }
}
