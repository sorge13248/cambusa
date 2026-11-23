import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { ActiveHousehold } from '../common/household/active-household.decorator.js';
import { HouseholdMemberGuard } from '../common/household/household-member.guard.js';
import { Location, ProductGroup, QuantityUnit, Store } from '../entities/index.js';
import { CatalogsService } from '../services/catalogs.service.js';

@Controller('catalogs')
@UseGuards(BearerJwtGuard, HouseholdMemberGuard)
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  // Quantity Units
  @Get('units')
  getUnits(@ActiveHousehold() householdId: string) {
    return this.catalogsService.getUnits(householdId);
  }

  @Post('units')
  createUnit(@ActiveHousehold() householdId: string, @Body() body: Partial<QuantityUnit>) {
    return this.catalogsService.createUnit(householdId, body);
  }

  @Put('units/:id')
  updateUnit(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body() body: Partial<QuantityUnit>,
  ) {
    return this.catalogsService.updateUnit(id, householdId, body);
  }

  @Delete('units/:id')
  deleteUnit(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.catalogsService.deleteUnit(id, householdId);
  }

  // Product Groups
  @Get('groups')
  getGroups(@ActiveHousehold() householdId: string) {
    return this.catalogsService.getGroups(householdId);
  }

  @Post('groups')
  createGroup(@ActiveHousehold() householdId: string, @Body() body: Partial<ProductGroup>) {
    return this.catalogsService.createGroup(householdId, body);
  }

  @Put('groups/:id')
  updateGroup(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body() body: Partial<ProductGroup>,
  ) {
    return this.catalogsService.updateGroup(id, householdId, body);
  }

  @Delete('groups/:id')
  deleteGroup(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.catalogsService.deleteGroup(id, householdId);
  }

  // Locations
  @Get('locations')
  getLocations(@ActiveHousehold() householdId: string) {
    return this.catalogsService.getLocations(householdId);
  }

  @Post('locations')
  createLocation(@ActiveHousehold() householdId: string, @Body() body: Partial<Location>) {
    return this.catalogsService.createLocation(householdId, body);
  }

  @Put('locations/:id')
  updateLocation(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body() body: Partial<Location>,
  ) {
    return this.catalogsService.updateLocation(id, householdId, body);
  }

  @Delete('locations/:id')
  deleteLocation(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.catalogsService.deleteLocation(id, householdId);
  }

  // Stores
  @Get('stores')
  getStores(@ActiveHousehold() householdId: string) {
    return this.catalogsService.getStores(householdId);
  }

  @Post('stores')
  createStore(@ActiveHousehold() householdId: string, @Body() body: Partial<Store>) {
    return this.catalogsService.createStore(householdId, body);
  }

  @Put('stores/:id')
  updateStore(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body() body: Partial<Store>,
  ) {
    return this.catalogsService.updateStore(id, householdId, body);
  }

  @Delete('stores/:id')
  deleteStore(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.catalogsService.deleteStore(id, householdId);
  }
}
