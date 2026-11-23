import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { HouseholdMemberGuard } from '../common/household/household-member.guard.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { ActiveHousehold } from '../common/household/active-household.decorator.js';
import { AuthUser } from '../common/auth/auth.types.js';
import { MealieService } from '../services/mealie.service.js';

@Controller('mealie')
@UseGuards(BearerJwtGuard)
export class MealieController {
  constructor(private readonly mealieService: MealieService) {}

  @Get('status')
  getStatus(@CurrentUser() user: AuthUser) {
    return this.mealieService.getMealieStatus(user);
  }

  @Get('foods')
  getFoods(@CurrentUser() user: AuthUser, @Query('refresh') refresh?: string) {
    const isRefresh = refresh === 'true' || refresh === '1';
    return this.mealieService.getMealieFoods(user, isRefresh);
  }

  @Get('recipes')
  getRecipes(@CurrentUser() user: AuthUser, @Query('refresh') refresh?: string) {
    const isRefresh = refresh === 'true' || refresh === '1';
    return this.mealieService.getMealieRecipes(user, isRefresh);
  }

  @Get('products/:productId/recipes')
  @UseGuards(HouseholdMemberGuard)
  getProductRecipes(
    @CurrentUser() user: AuthUser,
    @ActiveHousehold() householdId: string,
    @Param('productId') productId: string,
    @Query('refresh') refresh?: string,
  ) {
    const isRefresh = refresh === 'true' || refresh === '1';
    return this.mealieService.getProductRecipes(user, householdId, productId, isRefresh);
  }

  @Get('recipes/:recipeId/image')
  async getRecipeImage(
    @CurrentUser() user: AuthUser,
    @Param('recipeId') recipeId: string,
    @Res() res: Response,
  ) {
    const image = await this.mealieService.getRecipeImage(user, recipeId);
    if (!image) {
      throw new NotFoundException('Recipe image not found');
    }

    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(image.buffer);
  }
}
