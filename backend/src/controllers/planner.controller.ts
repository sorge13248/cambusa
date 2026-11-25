import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { AuthUser } from '../common/auth/auth.types.js';
import { ActiveHousehold } from '../common/household/active-household.decorator.js';
import { HouseholdMemberGuard } from '../common/household/household-member.guard.js';
import { MealSlot } from '../entities/index.js';
import { PlannerService } from '../services/planner.service.js';

@Controller('planner')
@UseGuards(BearerJwtGuard, HouseholdMemberGuard)
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @Get()
  getEntries(
    @ActiveHousehold() householdId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.plannerService.getEntries(householdId, startDate, endDate);
  }

  @Post()
  createEntry(
    @ActiveHousehold() householdId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { id?: string; date: string; mealSlot: MealSlot; productId: string; sortOrder?: number },
  ) {
    return this.plannerService.createEntry(householdId, user?.id ?? null, body);
  }

  @Delete(':id')
  deleteEntry(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.plannerService.deleteEntry(id, householdId);
  }
}
