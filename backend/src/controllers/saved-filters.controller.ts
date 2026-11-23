import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types.js';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { ActiveHousehold } from '../common/household/active-household.decorator.js';
import { HouseholdMemberGuard } from '../common/household/household-member.guard.js';
import { SavedFiltersService } from '../services/saved-filters.service.js';

@Controller('saved-filters')
@UseGuards(BearerJwtGuard, HouseholdMemberGuard)
export class SavedFiltersController {
  constructor(private readonly filtersService: SavedFiltersService) {}

  @Get()
  getFilters(@ActiveHousehold() householdId: string) {
    return this.filtersService.getFilters(householdId);
  }

  @Post()
  saveFilter(
    @ActiveHousehold() householdId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string; filterConfig: string },
  ) {
    return this.filtersService.saveFilter(householdId, user.id, body.name, body.filterConfig);
  }

  @Delete(':id')
  deleteFilter(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.filtersService.deleteFilter(id, householdId);
  }
}
