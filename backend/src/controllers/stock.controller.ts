import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { ActiveHousehold } from '../common/household/active-household.decorator.js';
import { HouseholdMemberGuard } from '../common/household/household-member.guard.js';
import { StockItem } from '../entities/index.js';
import { ExpirationPreset, StockService } from '../services/stock.service.js';

@Controller('stock')
@UseGuards(BearerJwtGuard, HouseholdMemberGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  getStock(@ActiveHousehold() householdId: string) {
    return this.stockService.getStock(householdId);
  }

  @Post()
  addStock(@ActiveHousehold() householdId: string, @Body() body: Partial<StockItem>) {
    return this.stockService.addStock(householdId, body);
  }

  @Post('transfer')
  transferStock(
    @ActiveHousehold() householdId: string,
    @Body()
    body: {
      stockItemId?: string;
      productId: string;
      fromLocationId?: string | null;
      toLocationId: string;
      amount: number;
    },
  ) {
    return this.stockService.transferStock(householdId, body);
  }

  @Post(':id/adjust-date')
  adjustDate(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body() body: { days?: number; preset?: ExpirationPreset; explicitDate?: string },
  ) {
    return this.stockService.adjustDate(id, householdId, body);
  }

  @Post(':id/consume')
  consumeStock(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body() body: { amount: number; isSpoiled?: boolean; locationId?: string },
  ) {
    return this.stockService.consumeStock(id, householdId, body.amount ?? 1, body);
  }

  @Post(':id/toggle-open')
  toggleOpen(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.stockService.toggleOpen(id, householdId);
  }

  @Put(':id')
  updateStock(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body()
    body: {
      amount?: number;
      bestBeforeDate?: string | null;
      purchasedDate?: string | null;
      price?: number | null;
      locationId?: string | null;
      note?: string | null;
      isOpen?: boolean;
      openedDate?: string | null;
    },
  ) {
    return this.stockService.updateStock(id, householdId, body);
  }

  @Delete(':id')
  deleteStock(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.stockService.deleteStock(id, householdId);
  }
}
