import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types.js';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { HouseholdsService } from '../services/households.service.js';
import { UsersService } from '../services/users.service.js';

@Controller('households')
@UseGuards(BearerJwtGuard)
export class HouseholdsController {
  constructor(
    private readonly householdsService: HouseholdsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async getMyHouseholds(@CurrentUser() user: AuthUser) {
    return this.householdsService.getUserHouseholds(user.id);
  }

  @Post()
  async createHousehold(@CurrentUser() user: AuthUser, @Body() body: { name: string }) {
    return this.householdsService.createHousehold(user.id, body.name);
  }

  @Put(':id')
  async updateHousehold(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    return this.householdsService.updateHousehold(id, user.id, body.name);
  }

  @Delete(':id')
  async deleteHousehold(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.householdsService.deleteHousehold(id, user.id);
    return { deleted: true };
  }

  @Get(':id/members')
  async getMembers(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.householdsService.getMembers(id, user.id);
  }

  @Post(':id/invitations')
  async sendInvitation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { email: string },
  ) {
    return this.householdsService.sendInvitation(id, user.id, body.email);
  }

  @Get(':id/invitations')
  async getPendingInvitationsSent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.householdsService.getPendingInvitationsSent(id, user.id);
  }

  @Delete(':id/invitations/:invitationId')
  async revokeInvitation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ) {
    await this.householdsService.revokeInvitation(invitationId, id, user.id);
    return { revoked: true };
  }

  @Get('invitations/received')
  async getReceivedInvitations(@CurrentUser() user: AuthUser) {
    return this.householdsService.getPendingInvitationsForEmail(user.email);
  }

  @Post('invitations/:invitationId/respond')
  async respondToInvitation(
    @CurrentUser() user: AuthUser,
    @Param('invitationId') invitationId: string,
    @Body() body: { accept: boolean },
  ) {
    const fullUser = await this.usersService.findById(user.id);
    if (!fullUser) {
      throw new Error('User not found');
    }
    return this.householdsService.respondToInvitation(invitationId, fullUser, body.accept);
  }
}
