import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { ApiKey, User, UserSettings } from '../entities/index.js';
import { AuthUser } from '../common/auth/auth.types.js';

export interface CreateApiKeyResult {
  id: string;
  name: string;
  keyPrefix: string;
  rawKey: string;
  createdAt: Date;
}

export interface MealieTestResult {
  ok: boolean;
  version?: string;
  recipeCount?: number;
  error?: string;
}

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(ApiKey)
    private readonly apiKeysRepo: Repository<ApiKey>,
    @InjectRepository(UserSettings)
    private readonly settingsRepo: Repository<UserSettings>,
  ) {}

  async getProfileData(user: AuthUser) {
    const existingUser = await this.usersRepo.findOne({ where: { id: user.id } });
    if (!existingUser) {
      throw new NotFoundException('User profile not found');
    }

    let settings = await this.settingsRepo.findOne({ where: { userId: user.id } });
    if (!settings) {
      settings = this.settingsRepo.create({
        userId: user.id,
        nextExpiringDays: 5,
        quickConsumeTimerSeconds: 10,
        mealieUrl: null,
        mealieApiToken: null,
        mealieLinked: false,
      });
      await this.settingsRepo.save(settings);
    }

    const apiKeys = await this.apiKeysRepo.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    return {
      user: {
        id: existingUser.id,
        subject: existingUser.subject,
        email: existingUser.email,
        displayName: existingUser.displayName,
        pictureUrl: existingUser.pictureUrl,
      },
      settings: {
        nextExpiringDays: settings.nextExpiringDays,
        quickConsumeTimerSeconds: settings.quickConsumeTimerSeconds || 10,
        mealieUrl: settings.mealieUrl,
        mealieLinked: settings.mealieLinked,
        hasMealieToken: Boolean(settings.mealieApiToken),
        notificationEmail: settings.notificationEmail,
        emailNotificationsEnabled: settings.emailNotificationsEnabled,
        notificationTime: settings.notificationTime || '06:00',
        smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT),
      },
      apiKeys: apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      })),
    };
  }

  async createApiKey(user: AuthUser, name: string): Promise<CreateApiKeyResult> {
    const randomHex = randomBytes(32).toString('hex');
    const rawKey = `cambusa_ak_${randomHex}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = `${rawKey.slice(0, 16)}...`;

    const apiKey = this.apiKeysRepo.create({
      userId: user.id,
      name: name?.trim() || 'Default API Key',
      keyHash,
      keyPrefix,
      lastUsedAt: null,
    });

    const saved = await this.apiKeysRepo.save(apiKey);

    return {
      id: saved.id,
      name: saved.name,
      keyPrefix: saved.keyPrefix,
      rawKey,
      createdAt: saved.createdAt,
    };
  }

  async revokeApiKey(user: AuthUser, keyId: string): Promise<boolean> {
    const res = await this.apiKeysRepo.delete({ id: keyId, userId: user.id });
    return (res.affected ?? 0) > 0;
  }

  async validateApiKey(rawKey: string): Promise<User | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.apiKeysRepo.findOne({ where: { keyHash } });
    if (!apiKey) {
      return null;
    }

    apiKey.lastUsedAt = new Date();
    await this.apiKeysRepo.save(apiKey);

    return this.usersRepo.findOne({ where: { id: apiKey.userId } });
  }

  async updateSettings(
    user: AuthUser,
    dto: {
      nextExpiringDays?: number;
      quickConsumeTimerSeconds?: number;
      mealieUrl?: string | null;
      mealieApiToken?: string | null;
      notificationEmail?: string | null;
      emailNotificationsEnabled?: boolean;
      notificationTime?: string;
    },
  ) {
    let settings = await this.settingsRepo.findOne({ where: { userId: user.id } });
    if (!settings) {
      settings = this.settingsRepo.create({ userId: user.id });
    }

    if (dto.nextExpiringDays !== undefined && dto.nextExpiringDays > 0) {
      settings.nextExpiringDays = dto.nextExpiringDays;
    }

    if (dto.quickConsumeTimerSeconds !== undefined && dto.quickConsumeTimerSeconds > 0) {
      settings.quickConsumeTimerSeconds = dto.quickConsumeTimerSeconds;
    }

    if (dto.mealieUrl !== undefined) {
      settings.mealieUrl = dto.mealieUrl ? dto.mealieUrl.trim().replace(/\/$/, '') : null;
    }

    if (dto.mealieApiToken !== undefined) {
      settings.mealieApiToken = dto.mealieApiToken ? dto.mealieApiToken.trim() : null;
      settings.mealieLinked = Boolean(settings.mealieUrl && settings.mealieApiToken);
    }

    if (dto.notificationEmail !== undefined) {
      settings.notificationEmail = dto.notificationEmail ? dto.notificationEmail.trim() : null;
    }

    if (dto.emailNotificationsEnabled !== undefined) {
      settings.emailNotificationsEnabled = Boolean(dto.emailNotificationsEnabled);
    }

    if (dto.notificationTime !== undefined && dto.notificationTime) {
      settings.notificationTime = dto.notificationTime.trim();
    }

    await this.settingsRepo.save(settings);

    return {
      nextExpiringDays: settings.nextExpiringDays,
      quickConsumeTimerSeconds: settings.quickConsumeTimerSeconds || 10,
      mealieUrl: settings.mealieUrl,
      mealieLinked: settings.mealieLinked,
      hasMealieToken: Boolean(settings.mealieApiToken),
      notificationEmail: settings.notificationEmail,
      emailNotificationsEnabled: settings.emailNotificationsEnabled,
      notificationTime: settings.notificationTime,
      smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT),
    };
  }

  async testMealieConnection(
    user: AuthUser,
    customUrl?: string,
    customToken?: string,
  ): Promise<MealieTestResult> {
    let url = customUrl?.trim().replace(/\/$/, '');
    let token = customToken?.trim();

    if (!url || !token) {
      const settings = await this.settingsRepo.findOne({ where: { userId: user.id } });
      url = url || settings?.mealieUrl?.trim().replace(/\/$/, '') || undefined;
      token = token || settings?.mealieApiToken?.trim() || undefined;
    }

    if (!url || !token) {
      return { ok: false, error: 'Mealie URL and API token are required' };
    }

    try {
      const aboutResponse = await fetch(`${url}/api/app/about`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!aboutResponse.ok) {
        // Try fallback to /api/recipes
        const recipesResponse = await fetch(`${url}/api/recipes?perPage=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!recipesResponse.ok) {
          return {
            ok: false,
            error: `Mealie connection returned status ${recipesResponse.status}: ${recipesResponse.statusText}`,
          };
        }

        const recipeData = (await recipesResponse.json()) as { total?: number };
        return {
          ok: true,
          version: 'connected',
          recipeCount: recipeData.total ?? 0,
        };
      }

      const aboutData = (await aboutResponse.json()) as { version?: string };

      // Optional count
      let recipeCount = 0;
      try {
        const recipesRes = await fetch(`${url}/api/recipes?perPage=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (recipesRes.ok) {
          const recData = (await recipesRes.json()) as { total?: number };
          recipeCount = recData.total ?? 0;
        }
      } catch {
        // Ignored
      }

      return {
        ok: true,
        version: aboutData.version || 'online',
        recipeCount,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Failed to connect to Mealie instance',
      };
    }
  }

  async getUserSettings(userId: string): Promise<UserSettings | null> {
    return this.settingsRepo.findOne({ where: { userId } });
  }
}
