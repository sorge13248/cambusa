import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, UserSettings } from '../entities/index.js';
import { AuthUser } from '../common/auth/auth.types.js';

export interface MealieCacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

export interface MealieStatusDto {
  configured: boolean;
  mealieUrl: string | null;
}

export interface MealieFoodItemDto {
  id: string;
  name: string;
  description: string | null;
}

export interface MealieRecipeItemDto {
  id: string;
  slug: string;
  name: string;
  totalTime: string | null;
  image: string | null;
}

export interface MealieProductRecipeDto {
  id: string;
  slug: string;
  name: string;
  totalTime: string | null;
  imageUrl: string | null;
}

export interface MealieProductRecipesResponseDto {
  configured: boolean;
  mealieUrl: string | null;
  recipes: MealieProductRecipeDto[];
  foods: Array<{ id: string; name: string }>;
  cachedAt: string;
  expiresAt: string;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours in ms

@Injectable()
export class MealieService {
  private readonly cache = new Map<string, MealieCacheEntry<any>>();

  constructor(
    @InjectRepository(UserSettings)
    private readonly settingsRepo: Repository<UserSettings>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  private async getCredentials(user: AuthUser): Promise<{ url: string; token: string } | null> {
    const settings = await this.settingsRepo.findOne({ where: { userId: user.id } });
    if (!settings || !settings.mealieUrl || !settings.mealieApiToken) {
      return null;
    }
    return {
      url: settings.mealieUrl.trim().replace(/\/$/, ''),
      token: settings.mealieApiToken.trim(),
    };
  }

  formatDuration(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Match ISO 8601 duration: e.g. PT30M, PT1H, PT1H30M, PT45S
    const isoMatch = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(trimmed);
    if (isoMatch) {
      const hours = isoMatch[1] ? parseInt(isoMatch[1], 10) : 0;
      const minutes = isoMatch[2] ? parseInt(isoMatch[2], 10) : 0;

      if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
      }
      if (hours > 0) {
        return `${hours}h`;
      }
      if (minutes > 0) {
        return `${minutes} min`;
      }
    }

    return trimmed;
  }

  async getMealieStatus(user: AuthUser): Promise<MealieStatusDto> {
    const creds = await this.getCredentials(user);
    return {
      configured: Boolean(creds),
      mealieUrl: creds ? creds.url : null,
    };
  }

  async getMealieFoods(
    user: AuthUser,
    refresh = false,
  ): Promise<{ items: MealieFoodItemDto[]; cachedAt: string; expiresAt: string }> {
    const creds = await this.getCredentials(user);
    if (!creds) {
      throw new BadRequestException('Mealie integration is not configured. Please set your Mealie URL and API token.');
    }

    const cacheKey = `foods:${user.id}`;
    const now = Date.now();

    if (!refresh && this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey)!;
      if (entry.expiresAt > now) {
        return {
          items: entry.data,
          cachedAt: new Date(entry.cachedAt).toISOString(),
          expiresAt: new Date(entry.expiresAt).toISOString(),
        };
      }
    }

    // Fetch from Mealie
    const response = await fetch(`${creds.url}/api/foods?perPage=-1`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    });

    if (!response.ok) {
      throw new BadRequestException(`Failed to fetch foods from Mealie (${response.status}: ${response.statusText})`);
    }

    const json = (await response.json()) as { items?: any[] };
    const rawItems = Array.isArray(json) ? json : json.items || [];

    const items: MealieFoodItemDto[] = rawItems.map((f) => ({
      id: f.id,
      name: f.name || 'Unnamed Food',
      description: f.description || null,
    }));

    // Sort alphabetically by name
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const cachedAt = now;
    const expiresAt = now + CACHE_TTL_MS;
    this.cache.set(cacheKey, { data: items, cachedAt, expiresAt });

    return {
      items,
      cachedAt: new Date(cachedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async getMealieRecipes(
    user: AuthUser,
    refresh = false,
  ): Promise<{ items: MealieRecipeItemDto[]; cachedAt: string; expiresAt: string }> {
    const creds = await this.getCredentials(user);
    if (!creds) {
      throw new BadRequestException('Mealie integration is not configured. Please set your Mealie URL and API token.');
    }

    const cacheKey = `recipes:${user.id}`;
    const now = Date.now();

    if (!refresh && this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey)!;
      if (entry.expiresAt > now) {
        return {
          items: entry.data,
          cachedAt: new Date(entry.cachedAt).toISOString(),
          expiresAt: new Date(entry.expiresAt).toISOString(),
        };
      }
    }

    // Fetch from Mealie
    const response = await fetch(`${creds.url}/api/recipes?perPage=-1`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    });

    if (!response.ok) {
      throw new BadRequestException(`Failed to fetch recipes from Mealie (${response.status}: ${response.statusText})`);
    }

    const json = (await response.json()) as { items?: any[] };
    const rawItems = Array.isArray(json) ? json : json.items || [];

    const items: MealieRecipeItemDto[] = rawItems.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name || 'Unnamed Recipe',
      totalTime: this.formatDuration(r.totalTime || r.prepTime || null),
      image: r.image || null,
    }));

    // Sort alphabetically by name
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const cachedAt = now;
    const expiresAt = now + CACHE_TTL_MS;
    this.cache.set(cacheKey, { data: items, cachedAt, expiresAt });

    return {
      items,
      cachedAt: new Date(cachedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  clearProductCache(productId?: string): void {
    if (productId) {
      for (const key of this.cache.keys()) {
        if (key.includes(`:${productId}`)) {
          this.cache.delete(key);
        }
      }
    } else {
      for (const key of this.cache.keys()) {
        if (key.startsWith('product-recipes:')) {
          this.cache.delete(key);
        }
      }
    }
  }

  async getProductRecipes(
    user: AuthUser,
    householdId: string,
    productId: string,
    refresh = false,
  ): Promise<MealieProductRecipesResponseDto> {
    const product = await this.productsRepo.findOne({ where: { id: productId, householdId } });
    if (!product) {
      throw new NotFoundException('Product not found in current household');
    }

    const creds = await this.getCredentials(user);
    if (!creds) {
      return {
        configured: false,
        mealieUrl: null,
        recipes: [],
        foods: product.mealieFoods || [],
        cachedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      };
    }

    const cacheKey = `product-recipes:${user.id}:${productId}`;
    const now = Date.now();

    if (refresh) {
      this.cache.delete(cacheKey);
    } else if (this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey)!;
      if (entry.expiresAt > now) {
        return entry.data;
      }
    }

    // Resolve ancestors to inherit mealieFoods and mealieRecipes from direct and indirect parents
    const allHouseholdProducts = await this.productsRepo.find({ where: { householdId } });
    const productMap = new Map<string, Product>();
    for (const p of allHouseholdProducts) {
      productMap.set(p.id, p);
    }

    const aggregatedFoodsMap = new Map<string, { id: string; name: string }>();
    const aggregatedRecipesMap = new Map<string, { id: string; slug: string; name: string }>();

    let current: Product | undefined = product;
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);

      if (current.mealieFoods && Array.isArray(current.mealieFoods)) {
        for (const food of current.mealieFoods) {
          if (!aggregatedFoodsMap.has(food.id)) {
            aggregatedFoodsMap.set(food.id, food);
          }
        }
      }

      if (current.mealieRecipes && Array.isArray(current.mealieRecipes)) {
        for (const recipe of current.mealieRecipes) {
          if (!aggregatedRecipesMap.has(recipe.id)) {
            aggregatedRecipesMap.set(recipe.id, recipe);
          }
        }
      }

      current = current.parentProductId ? productMap.get(current.parentProductId) : undefined;
    }

    const linkedFoods = Array.from(aggregatedFoodsMap.values());
    const linkedRecipes = Array.from(aggregatedRecipesMap.values());
    const recipesMap = new Map<string, MealieProductRecipeDto>();

    // 1. Query Mealie recipes containing linked foods
    if (linkedFoods.length > 0) {
      try {
        const queryFilter =
          linkedFoods.length === 1
            ? `recipeIngredient.food.id = "${linkedFoods[0].id}"`
            : `recipeIngredient.food.id IN [${linkedFoods.map((f) => `"${f.id}"`).join(',')}]`;

        const filterUrl = `${creds.url}/api/recipes?queryFilter=${encodeURIComponent(queryFilter)}&perPage=50`;
        const res = await fetch(filterUrl, {
          headers: { Authorization: `Bearer ${creds.token}` },
        });

        if (res.ok) {
          const json = (await res.json()) as { items?: any[] };
          const items = Array.isArray(json) ? json : json.items || [];
          for (const item of items) {
            recipesMap.set(item.id, {
              id: item.id,
              slug: item.slug,
              name: item.name,
              totalTime: this.formatDuration(item.totalTime || item.prepTime || null),
              imageUrl: item.image ? `/api/mealie/recipes/${item.id}/image` : null,
            });
          }
        }
      } catch {
        // Continue to explicitly linked recipes on queryFilter failure
      }
    }

    // 2. Fetch or resolve explicitly linked recipes
    if (linkedRecipes.length > 0) {
      for (const rec of linkedRecipes) {
        if (!recipesMap.has(rec.id)) {
          try {
            const res = await fetch(`${creds.url}/api/recipes/${rec.slug || rec.id}`, {
              headers: { Authorization: `Bearer ${creds.token}` },
            });
            if (res.ok) {
              const item = await res.json();
              recipesMap.set(item.id, {
                id: item.id,
                slug: item.slug || rec.slug,
                name: item.name || rec.name,
                totalTime: this.formatDuration(item.totalTime || item.prepTime || null),
                imageUrl: item.image ? `/api/mealie/recipes/${item.id}/image` : null,
              });
            } else {
              // Fallback to basic information from link
              recipesMap.set(rec.id, {
                id: rec.id,
                slug: rec.slug,
                name: rec.name,
                totalTime: null,
                imageUrl: null,
              });
            }
          } catch {
            recipesMap.set(rec.id, {
              id: rec.id,
              slug: rec.slug,
              name: rec.name,
              totalTime: null,
              imageUrl: null,
            });
          }
        }
      }
    }

    const recipes = Array.from(recipesMap.values());
    const cachedAt = now;
    const expiresAt = now + CACHE_TTL_MS;

    const result: MealieProductRecipesResponseDto = {
      configured: true,
      mealieUrl: creds.url,
      recipes,
      foods: linkedFoods,
      cachedAt: new Date(cachedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    };

    this.cache.set(cacheKey, { data: result, cachedAt, expiresAt });
    return result;
  }

  async getRecipeImage(
    user: AuthUser,
    recipeId: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const creds = await this.getCredentials(user);
    if (!creds) {
      throw new BadRequestException('Mealie integration is not configured');
    }

    const safeRecipeId = encodeURIComponent(recipeId);
    const candidates = [
      `${creds.url}/api/media/recipes/${safeRecipeId}/images/min-original.webp`,
      `${creds.url}/api/media/recipes/${safeRecipeId}/images/original.webp`,
      `${creds.url}/api/recipes/${safeRecipeId}/image`,
    ];

    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${creds.token}` },
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || 'image/webp';
          const arrayBuffer = await response.arrayBuffer();
          return {
            buffer: Buffer.from(arrayBuffer),
            contentType,
          };
        }
      } catch {
        // try next candidate
      }
    }

    return null;
  }
}
