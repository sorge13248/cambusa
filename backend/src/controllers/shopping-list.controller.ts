import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { ActiveHousehold } from '../common/household/active-household.decorator.js';
import { HouseholdMemberGuard } from '../common/household/household-member.guard.js';
import { ShoppingListItem } from '../entities/index.js';
import { ShoppingListService } from '../services/shopping-list.service.js';

@Controller('shopping-list')
@UseGuards(BearerJwtGuard, HouseholdMemberGuard)
export class ShoppingListController {
  constructor(private readonly shoppingListService: ShoppingListService) {}

  @Get()
  getLists(@ActiveHousehold() householdId: string) {
    return this.shoppingListService.getLists(householdId);
  }

  @Post()
  createList(
    @ActiveHousehold() householdId: string,
    @Body() body: { name: string; storeId?: string | null },
  ) {
    return this.shoppingListService.createList(householdId, body);
  }

  @Put(':id')
  updateList(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body() body: { name?: string; storeId?: string | null },
  ) {
    return this.shoppingListService.updateList(id, householdId, body);
  }

  @Delete(':id')
  deleteList(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.shoppingListService.deleteList(id, householdId);
  }

  @Get('default')
  getDefaultList(@ActiveHousehold() householdId: string) {
    return this.shoppingListService.getDefaultList(householdId);
  }

  @Get('items')
  async getItems(
    @ActiveHousehold() householdId: string,
    @Query('shoppingListId') listId?: string,
    @Query('storeId') storeId?: string,
  ) {
    const targetListId = listId || (await this.shoppingListService.getDefaultList(householdId)).id;
    return this.shoppingListService.getItems(targetListId, householdId, storeId);
  }

  @Post('items')
  addItem(@ActiveHousehold() householdId: string, @Body() body: Partial<ShoppingListItem>) {
    return this.shoppingListService.addItem(householdId, body);
  }

  @Put('items/:id')
  updateItem(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body() body: Partial<ShoppingListItem>,
  ) {
    return this.shoppingListService.updateItem(id, householdId, body);
  }

  @Post('items/:id/toggle-done')
  toggleDone(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.shoppingListService.toggleDone(id, householdId);
  }

  @Delete('items/:id')
  deleteItem(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.shoppingListService.deleteItem(id, householdId);
  }

  @Delete('clear-done')
  async clearDone(@ActiveHousehold() householdId: string, @Query('shoppingListId') listId?: string) {
    const targetListId = listId || (await this.shoppingListService.getDefaultList(householdId)).id;
    return this.shoppingListService.clearDoneItems(targetListId, householdId);
  }

  @Get('missing-products')
  getMissingProducts(@ActiveHousehold() householdId: string) {
    return this.shoppingListService.getMissingProducts(householdId);
  }

  @Post('add-missing')
  async addMissingProducts(
    @ActiveHousehold() householdId: string,
    @Body() body: { shoppingListId?: string; productIds?: string[] },
  ) {
    const targetListId = body.shoppingListId || (await this.shoppingListService.getDefaultList(householdId)).id;
    return this.shoppingListService.addMissingProductsToList(targetListId, householdId, body.productIds);
  }
}
