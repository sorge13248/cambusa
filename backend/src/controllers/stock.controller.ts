import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { ActiveHousehold } from '../common/household/active-household.decorator.js';
import { HouseholdMemberGuard } from '../common/household/household-member.guard.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { AuthUser } from '../common/auth/auth.types.js';
import { StockItem } from '../entities/index.js';
import { ExpirationPreset, StockService } from '../services/stock.service.js';
import { ProfileService } from '../services/profile.service.js';

@Controller('stock')
@UseGuards(BearerJwtGuard, HouseholdMemberGuard)
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly profileService: ProfileService,
  ) {}

  @Get()
  async getStock(
    @ActiveHousehold() householdId: string,
    @CurrentUser() user: AuthUser,
    @Query('dueSoonDays') dueSoonDays?: string,
  ) {
    let days: number | undefined;
    if (dueSoonDays) {
      const parsed = parseInt(dueSoonDays, 10);
      if (!isNaN(parsed) && parsed > 0) {
        days = parsed;
      }
    }
    if (!days && user?.id) {
      const settings = await this.profileService.getUserSettings(user.id);
      if (settings?.nextExpiringDays) {
        days = settings.nextExpiringDays;
      }
    }
    return this.stockService.getStock(householdId, days ?? 5);
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
