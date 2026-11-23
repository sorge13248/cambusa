import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { ActiveHousehold } from '../common/household/active-household.decorator.js';
import { HouseholdMemberGuard } from '../common/household/household-member.guard.js';
import { SyncPayloadDto } from '../common/sync/sync.types.js';
import { SyncService } from '../services/sync.service.js';

@Controller('sync')
@UseGuards(BearerJwtGuard, HouseholdMemberGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  sync(@ActiveHousehold() householdId: string, @Body() body: SyncPayloadDto) {
    return this.syncService.sync(householdId, body);
  }
}
