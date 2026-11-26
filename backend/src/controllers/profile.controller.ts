import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { AuthUser } from '../common/auth/auth.types.js';
import { ProfileService } from '../services/profile.service.js';
import { MailService } from '../services/mail.service.js';
import { MealSlot, MealSlotEmailConfig } from '../entities/index.js';

@Controller('profile')
@UseGuards(BearerJwtGuard)
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly mailService: MailService,
  ) {}

  @Get()
  getProfile(@CurrentUser() user: AuthUser) {
    return this.profileService.getProfileData(user);
  }

  @Post('api-keys')
  createApiKey(@CurrentUser() user: AuthUser, @Body() body: { name?: string }) {
    return this.profileService.createApiKey(user, body?.name || 'API Key');
  }

  @Delete('api-keys/:id')
  async revokeApiKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const success = await this.profileService.revokeApiKey(user, id);
    return { success };
  }

  @Put('settings')
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      nextExpiringDays?: number;
      quickConsumeTimerSeconds?: number;
      mealieUrl?: string | null;
      mealieApiToken?: string | null;
      notificationEmail?: string | null;
      emailNotificationsEnabled?: boolean;
      notificationTime?: string;
      mealPlanEmailSettings?: Partial<Record<MealSlot, Partial<MealSlotEmailConfig>>>;
    },
  ) {
    return this.profileService.updateSettings(user, body);
  }

  @Post('mealie/test')
  testMealie(
    @CurrentUser() user: AuthUser,
    @Body() body: { mealieUrl?: string; mealieApiToken?: string; url?: string; token?: string },
  ) {
    const url = body?.mealieUrl || body?.url;
    const token = body?.mealieApiToken || body?.token;
    return this.profileService.testMealieConnection(user, url, token);
  }

  @Post('notifications/test')
  testNotification(@CurrentUser() user: AuthUser) {
    return this.mailService.sendTestNotification(user);
  }

  @Post('notifications/test-meal-slot')
  testMealSlotNotification(
    @CurrentUser() user: AuthUser,
    @Body() body: { mealSlot: MealSlot },
  ) {
    return this.mailService.sendTestMealSlotNotification(user, body?.mealSlot);
  }
}
