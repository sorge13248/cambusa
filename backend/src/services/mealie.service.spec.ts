import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MealieService } from './mealie.service.js';
import { Product, UserSettings } from '../entities/index.js';
import { AuthUser } from '../common/auth/auth.types.js';

describe('MealieService', () => {
  let service: MealieService;
  let mockSettingsRepo: any;
  let mockProductsRepo: any;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'Test User',
    households: [],
  };

  beforeEach(() => {
    mockSettingsRepo = {
      findOne: vi.fn(),
    };
    mockProductsRepo = {
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
    };
    service = new MealieService(mockSettingsRepo, mockProductsRepo);
    vi.restoreAllMocks();
  });

  describe('formatDuration', () => {
    it('formats ISO 8601 durations correctly', () => {
      expect(service.formatDuration('PT30M')).toBe('30 min');
      expect(service.formatDuration('PT1H')).toBe('1h');
      expect(service.formatDuration('PT1H45M')).toBe('1h 45m');
      expect(service.formatDuration('PT2H30M')).toBe('2h 30m');
      expect(service.formatDuration('45 minutes')).toBe('45 minutes');
      expect(service.formatDuration(null)).toBeNull();
      expect(service.formatDuration('')).toBeNull();
    });
  });

  describe('getMealieStatus', () => {
    it('returns configured: false when no settings exist', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);
      const res = await service.getMealieStatus(mockUser);
      expect(res.configured).toBe(false);
      expect(res.mealieUrl).toBeNull();
    });

    it('returns configured: true when mealieUrl and mealieApiToken exist', async () => {
      mockSettingsRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        mealieUrl: 'https://mealie.local/',
        mealieApiToken: 'token-123',
      } as UserSettings);

      const res = await service.getMealieStatus(mockUser);
      expect(res.configured).toBe(true);
      expect(res.mealieUrl).toBe('https://mealie.local');
    });
  });

  describe('getMealieFoods caching and refresh', () => {
    it('caches food results for 4 hours and obeys refresh flag', async () => {
      mockSettingsRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        mealieUrl: 'https://mealie.local',
        mealieApiToken: 'token-123',
      } as UserSettings);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: 'f2', name: 'Zucchini' },
            { id: 'f1', name: 'Apple' },
          ],
        }),
      });
      global.fetch = fetchMock;

      // First call: fetches from remote
      const res1 = await service.getMealieFoods(mockUser, false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res1.items.length).toBe(2);
      expect(res1.items[0].name).toBe('Apple'); // Sorted alphabetically
      expect(res1.items[1].name).toBe('Zucchini');

      // Second call: served from 4h cache, fetch not called again
      const res2 = await service.getMealieFoods(mockUser, false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res2.items[0].name).toBe('Apple');

      // Third call with refresh=true: forces network refresh
      await service.getMealieFoods(mockUser, true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMealieRecipes caching and refresh', () => {
    it('caches recipe results for 4 hours and obeys refresh flag', async () => {
      mockSettingsRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        mealieUrl: 'https://mealie.local',
        mealieApiToken: 'token-123',
      } as UserSettings);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: 'r2', slug: 'pizza', name: 'Pizza', totalTime: 'PT40M', image: 'pizza.webp' },
            { id: 'r1', slug: 'bruschetta', name: 'Bruschetta', totalTime: 'PT15M', image: null },
          ],
        }),
      });
      global.fetch = fetchMock;

      // 1st call: network
      const res1 = await service.getMealieRecipes(mockUser, false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res1.items.length).toBe(2);
      expect(res1.items[0].name).toBe('Bruschetta'); // Sorted
      expect(res1.items[0].totalTime).toBe('15 min');
      expect(res1.items[1].totalTime).toBe('40 min');

      // 2nd call: cache
      await service.getMealieRecipes(mockUser, false);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 3rd call with refresh=true: re-fetches
      await service.getMealieRecipes(mockUser, true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getProductRecipes', () => {
    it('queries Mealie with queryFilter for mapped foods and explicit recipes', async () => {
      mockSettingsRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        mealieUrl: 'https://mealie.local',
        mealieApiToken: 'token-123',
      } as UserSettings);

      const mockProduct: Partial<Product> = {
        id: 'p1',
        name: 'Organic Tomatoes',
        householdId: 'h1',
        mealieFoods: [{ id: 'food-uuid-1', name: 'Tomato' }],
        mealieRecipes: [{ id: 'recipe-uuid-custom', slug: 'tomato-soup', name: 'Tomato Soup' }],
      };
      mockProductsRepo.findOne.mockResolvedValue(mockProduct);

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('queryFilter=')) {
          return {
            ok: true,
            json: async () => ({
              items: [
                { id: 'rec-1', slug: 'pasta-al-pomodoro', name: 'Pasta al Pomodoro', totalTime: 'PT20M', image: 'pasta.webp' },
              ],
            }),
          };
        }
        if (url.includes('tomato-soup')) {
          return {
            ok: true,
            json: async () => ({
              id: 'recipe-uuid-custom',
              slug: 'tomato-soup',
              name: 'Tomato Soup',
              totalTime: 'PT35M',
              image: 'soup.webp',
            }),
          };
        }
        return { ok: false };
      });
      global.fetch = fetchMock;

      const res = await service.getProductRecipes(mockUser, 'h1', 'p1', false);
      expect(res.configured).toBe(true);
      expect(res.recipes.length).toBe(2);
      expect(res.recipes[0].name).toBe('Pasta al Pomodoro');
      expect(res.recipes[0].totalTime).toBe('20 min');
      expect(res.recipes[0].imageUrl).toBe('/api/mealie/recipes/rec-1/image');

      expect(res.recipes[1].name).toBe('Tomato Soup');
      expect(res.recipes[1].totalTime).toBe('35 min');
      expect(res.recipes[1].imageUrl).toBe('/api/mealie/recipes/recipe-uuid-custom/image');

      // Subsequent call uses 4h cache
      const cached = await service.getProductRecipes(mockUser, 'h1', 'p1', false);
      expect(cached.recipes.length).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(2); // no extra calls
    });

    it('inherits foods and recipes from parent products (direct and indirect)', async () => {
      mockSettingsRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        mealieUrl: 'https://mealie.local',
        mealieApiToken: 'token-123',
      } as UserSettings);

      const grandparentProduct: Partial<Product> = {
        id: 'p-grandparent',
        name: 'Fruit',
        householdId: 'h1',
        parentProductId: null,
        mealieFoods: [{ id: 'food-fruit', name: 'Fruit' }],
        mealieRecipes: [],
      };

      const parentProduct: Partial<Product> = {
        id: 'p-parent',
        name: 'Apples',
        householdId: 'h1',
        parentProductId: 'p-grandparent',
        mealieFoods: [{ id: 'food-apple', name: 'Apple' }],
        mealieRecipes: [{ id: 'rec-apple-pie', slug: 'apple-pie', name: 'Apple Pie' }],
      };

      const childProduct: Partial<Product> = {
        id: 'p-child',
        name: 'Golden Delicious',
        householdId: 'h1',
        parentProductId: 'p-parent',
        mealieFoods: [{ id: 'food-golden', name: 'Golden Apple' }],
        mealieRecipes: [],
      };

      mockProductsRepo.findOne.mockResolvedValue(childProduct);
      mockProductsRepo.find.mockResolvedValue([grandparentProduct, parentProduct, childProduct]);

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('queryFilter=')) {
          return {
            ok: true,
            json: async () => ({
              items: [
                { id: 'rec-cider', slug: 'apple-cider', name: 'Apple Cider', totalTime: 'PT1H', image: 'cider.webp' },
              ],
            }),
          };
        }
        if (url.includes('apple-pie')) {
          return {
            ok: true,
            json: async () => ({
              id: 'rec-apple-pie',
              slug: 'apple-pie',
              name: 'Apple Pie',
              totalTime: 'PT45M',
              image: 'pie.webp',
            }),
          };
        }
        return { ok: false };
      });
      global.fetch = fetchMock;

      const res = await service.getProductRecipes(mockUser, 'h1', 'p-child', false);
      expect(res.configured).toBe(true);

      // Verify that all foods from child, parent, and grandparent are included
      const foodNames = res.foods.map((f) => f.name);
      expect(foodNames).toContain('Golden Apple');
      expect(foodNames).toContain('Apple');
      expect(foodNames).toContain('Fruit');

      // Verify queryFilter included all inherited foods
      const lastCallUrl = fetchMock.mock.calls[0][0] as string;
      expect(decodeURIComponent(lastCallUrl)).toContain('food-golden');
      expect(decodeURIComponent(lastCallUrl)).toContain('food-apple');
      expect(decodeURIComponent(lastCallUrl)).toContain('food-fruit');

      // Verify recipes include both discovered and inherited explicit recipes
      expect(res.recipes.length).toBe(2);
      expect(res.recipes.some((r) => r.name === 'Apple Pie')).toBe(true);
      expect(res.recipes.some((r) => r.name === 'Apple Cider')).toBe(true);
    });
  });
});
