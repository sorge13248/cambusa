import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { AuthUser } from '../common/auth/auth.types.js';
import { NextService } from '../services/next.service.js';

@Controller('next')
@UseGuards(BearerJwtGuard)
export class NextController {
  constructor(private readonly nextService: NextService) {}

  @Get()
  getNext(
    @CurrentUser() user: AuthUser,
    @Headers('x-household-id') householdId?: string,
    @Query('days') days?: string,
  ) {
    const parsedDays = days ? parseInt(days, 10) : undefined;
    return this.nextService.getNextData(user, householdId, parsedDays);
  }
}
