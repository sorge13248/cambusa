import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import nodemailer from 'nodemailer';
type Transporter = ReturnType<typeof nodemailer.createTransport>;
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  Location,
  MealPlanEntry,
  MealSlot,
  Product,
  QuantityUnit,
  StockItem,
  User,
  UserSettings,
} from '../entities/index.js';
import { AuthUser } from '../common/auth/auth.types.js';
import { NextService } from './next.service.js';
import { HouseholdsService } from './households.service.js';
import { normalizeMealPlanEmailSettings } from './profile.service.js';
import { resolveUploadsDir } from '../load-env.js';

const MEAL_SLOT_LABELS: Record<MealSlot, { label: string; emoji: string }> = {
  breakfast: { label: 'Breakfast', emoji: '☕' },
  morning_snack: { label: 'Morning Snack', emoji: '🍎' },
  lunch: { label: 'Lunch', emoji: '🍽️' },
  afternoon_snack: { label: 'Afternoon Snack', emoji: '🍪' },
  dinner: { label: 'Dinner', emoji: '🌙' },
};

@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(UserSettings)
    private readonly settingsRepo: Repository<UserSettings>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    private readonly nextService: NextService,
    private readonly householdsService: HouseholdsService,
    @Optional()
    @InjectRepository(MealPlanEntry)
    private readonly mealPlanRepo?: Repository<MealPlanEntry>,
    @Optional()
    @InjectRepository(StockItem)
    private readonly stockRepo?: Repository<StockItem>,
    @Optional()
    @InjectRepository(QuantityUnit)
    private readonly unitsRepo?: Repository<QuantityUnit>,
    @Optional()
    @InjectRepository(Location)
    private readonly locationsRepo?: Repository<Location>,
  ) {}

  onModuleInit() {
    // Check scheduled notifications every minute
    this.timer = setInterval(() => {
      this.checkAndSendScheduledNotifications().catch((err) => {
        this.logger.error('Error during scheduled email notification check:', err);
      });
    }, 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
  }

  private createTransporter(): Transporter | null {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASSWORD;

    if (!host) {
      return null;
    }

    const config: any = {
      host,
      port,
      secure,
    };

    if (user && pass) {
      config.auth = { user, pass };
    }

    return nodemailer.createTransport(config);
  }

  async sendTestNotification(user: AuthUser): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        message: 'SMTP service is not configured on the server. Please set SMTP_HOST and SMTP_PORT.',
      };
    }

    const settings = await this.settingsRepo.findOne({ where: { userId: user.id } });
    const fullUser = await this.usersRepo.findOne({ where: { id: user.id } });

    if (!fullUser) {
      return { ok: false, message: 'User record not found.' };
    }

    const targetEmail = settings?.notificationEmail?.trim() || fullUser.email?.trim();
    if (!targetEmail) {
      return {
        ok: false,
        message: 'No recipient email configured. Please set a notification email in your settings.',
      };
    }

    try {
      const nextData = await this.nextService.getNextData(user);
      return await this.sendDailyDigest(fullUser, settings, nextData, true);
    } catch (err: any) {
      return {
        ok: false,
        message: `Failed to compile notification digest: ${err?.message || err}`,
      };
    }
  }

  async sendDailyDigest(
    user: User,
    settings: UserSettings | null,
    nextData: any,
    isTest = false,
  ): Promise<{ ok: boolean; message: string }> {
    const transporter = this.createTransporter();
    if (!transporter) {
      return { ok: false, message: 'SMTP transporter could not be initialized.' };
    }

    const recipient = settings?.notificationEmail?.trim() || user.email?.trim();
    if (!recipient) {
      return { ok: false, message: 'Recipient email address is missing.' };
    }

    const sender = process.env.SMTP_SENDER?.trim() || '"Cambusa" <notifications@cambusa.local>';
    const subject = isTest
      ? `[Test] Cambusa Morning Digest — ${nextData.household?.name || 'My Home'}`
      : `🌅 Cambusa Morning Digest — ${nextData.household?.name || 'My Home'}`;

    const uploadsDir = resolveUploadsDir();
    const allItems = [...(nextData.expired || []), ...(nextData.expiringSoon || [])];
    const productIds = Array.from(new Set(allItems.map((i: any) => i.productId)));
    const { productPicturesMap, attachments } = await this.buildProductPicturesMap(productIds, uploadsDir);

    const htmlContent = this.generateDigestHtml(user, nextData, productPicturesMap, isTest);

    try {
      await transporter.sendMail({
        from: sender,
        to: recipient,
        subject,
        html: htmlContent,
        attachments,
      });

      return {
        ok: true,
        message: `Notification email successfully delivered to ${recipient}`,
      };
    } catch (err: any) {
      this.logger.error(`Error sending email to ${recipient}:`, err);
      return {
        ok: false,
        message: `SMTP delivery failed: ${err?.message || err}`,
      };
    }
  }

  private async buildProductPicturesMap(
    productIds: string[],
    uploadsDir: string,
  ): Promise<{
    productPicturesMap: Map<string, string>;
    attachments: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string; cid: string }>;
  }> {
    const productPicturesMap = new Map<string, string>();
    const attachments: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string; cid: string }> = [];

    if (productIds.length === 0) {
      return { productPicturesMap, attachments };
    }

    const products = await this.productsRepo.find({
      where: productIds.map((id) => ({ id })),
    });

    const parentIds = products
      .map((p) => p.parentProductId)
      .filter((pid): pid is string => Boolean(pid && !products.some((pr) => pr.id === pid)));

    let parentProducts: Product[] = [];
    if (parentIds.length > 0) {
      parentProducts = await this.productsRepo.find({
        where: parentIds.map((id) => ({ id })),
      });
    }

    const allProductMap = new Map<string, Product>();
    for (const p of [...products, ...parentProducts]) {
      allProductMap.set(p.id, p);
    }

    const extractPics = (p: Product): string[] => {
      if (Array.isArray(p.pictureFileNames)) return p.pictureFileNames;
      if (typeof p.pictureFileNames === 'string') {
        try {
          const parsed = JSON.parse(p.pictureFileNames);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    for (const prod of products) {
      let picList = extractPics(prod);
      if (picList.length === 0 && prod.parentProductId) {
        const parent = allProductMap.get(prod.parentProductId);
        if (parent) {
          picList = extractPics(parent);
        }
      }

      if (picList.length > 0) {
        const firstPic = picList[0];
        const localPath = join(uploadsDir, 'products', firstPic);
        if (existsSync(localPath)) {
          const cid = `prod-img-${prod.id}`;
          try {
            const jpegBuffer = await sharp(localPath)
              .resize(120, 120, { fit: 'cover' })
              .jpeg({ quality: 85 })
              .toBuffer();

            productPicturesMap.set(prod.id, cid);
            attachments.push({
              filename: `${prod.id}.jpg`,
              content: jpegBuffer,
              contentType: 'image/jpeg',
              cid,
            });
          } catch (sharpErr) {
            this.logger.warn(`Could not transcode image for product ${prod.id}, attaching raw file: ${sharpErr}`);
            productPicturesMap.set(prod.id, cid);
            attachments.push({
              filename: firstPic,
              path: localPath,
              cid,
            });
          }
        }
      }
    }

    return { productPicturesMap, attachments };
  }

  async sendTestMealSlotNotification(
    user: AuthUser,
    mealSlot: MealSlot,
  ): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        message: 'SMTP service is not configured on the server. Please set SMTP_HOST and SMTP_PORT.',
      };
    }

    if (!mealSlot || !MEAL_SLOT_LABELS[mealSlot]) {
      return { ok: false, message: 'Invalid meal slot specified.' };
    }

    const settings = await this.settingsRepo.findOne({ where: { userId: user.id } });
    const fullUser = await this.usersRepo.findOne({ where: { id: user.id } });

    if (!fullUser) {
      return { ok: false, message: 'User record not found.' };
    }

    const targetEmail = settings?.notificationEmail?.trim() || fullUser.email?.trim();
    if (!targetEmail) {
      return {
        ok: false,
        message: 'No recipient email configured. Please set a notification email in your settings.',
      };
    }

    return this.sendMealSlotNotification(fullUser, settings, mealSlot, true);
  }

  async sendMealSlotNotification(
    user: User,
    settings: UserSettings | null,
    mealSlot: MealSlot,
    isTest = false,
  ): Promise<{ ok: boolean; message: string; sentCount?: number }> {
    const transporter = this.createTransporter();
    if (!transporter) {
      return { ok: false, message: 'SMTP transporter could not be initialized.' };
    }

    const recipient = settings?.notificationEmail?.trim() || user.email?.trim();
    if (!recipient) {
      return { ok: false, message: 'Recipient email address is missing.' };
    }

    const households = await this.householdsService.getUserHouseholds(user.id);
    if (households.length === 0) {
      return { ok: false, message: 'No accessible household found for user.' };
    }

    const slotConfig = normalizeMealPlanEmailSettings(settings?.mealPlanEmailSettings)[mealSlot];
    const slotMeta = MEAL_SLOT_LABELS[mealSlot];
    const todayStr = new Date().toISOString().slice(0, 10);
    const sender = process.env.SMTP_SENDER?.trim() || '"Cambusa" <notifications@cambusa.local>';
    const uploadsDir = resolveUploadsDir();

    let sentCount = 0;

    for (const hh of households) {
      const entries = this.mealPlanRepo
        ? await this.mealPlanRepo.find({
            where: { householdId: hh.id, date: todayStr, mealSlot },
            order: { sortOrder: 'ASC', createdAt: 'ASC' },
          })
        : [];

      if (!isTest && slotConfig.onlyIfHasEntries && entries.length === 0) {
        continue;
      }

      const productIds = Array.from(new Set(entries.map((e) => e.productId)));
      const products =
        productIds.length > 0
          ? await this.productsRepo.find({ where: productIds.map((id) => ({ id, householdId: hh.id })) })
          : [];
      const productMap = new Map(products.map((p) => [p.id, p]));

      const stockItems =
        this.stockRepo && productIds.length > 0
          ? await this.stockRepo.find({
              where: productIds.map((id) => ({ productId: id, householdId: hh.id })),
              order: { bestBeforeDate: 'ASC' },
            })
          : [];

      const units = this.unitsRepo ? await this.unitsRepo.find({ where: { householdId: hh.id } }) : [];
      const locations = this.locationsRepo ? await this.locationsRepo.find({ where: { householdId: hh.id } }) : [];
      const unitMap = new Map(units.map((u) => [u.id, u]));
      const locationMap = new Map(locations.map((l) => [l.id, l]));

      const stockByProduct = new Map<string, StockItem[]>();
      for (const s of stockItems) {
        const list = stockByProduct.get(s.productId) || [];
        list.push(s);
        stockByProduct.set(s.productId, list);
      }

      const mealItems = entries.map((entry) => {
        const prod = productMap.get(entry.productId);
        const prodStock = stockByProduct.get(entry.productId) || [];
        const totalAmount = prodStock.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
        const earliestStock = prodStock.find((s) => Boolean(s.bestBeforeDate)) || prodStock[0];
        const unit = prod?.quStockId ? unitMap.get(prod.quStockId) : null;
        const loc = earliestStock?.locationId
          ? locationMap.get(earliestStock.locationId)
          : prod?.defaultLocationId
            ? locationMap.get(prod.defaultLocationId)
            : null;

        return {
          entryId: entry.id,
          productId: entry.productId,
          productName: prod?.name || 'Unknown Product',
          amount: totalAmount,
          quantityUnit: unit?.name || 'units',
          location: loc?.name || 'Default Location',
          bestBeforeDate: earliestStock?.bestBeforeDate || null,
          isOpened: prodStock.some((s) => Boolean(s.isOpen)),
          inStock: totalAmount > 0,
        };
      });

      const { productPicturesMap, attachments } = await this.buildProductPicturesMap(productIds, uploadsDir);
      const htmlContent = this.generateMealSlotHtml(user, hh, mealSlot, mealItems, productPicturesMap, isTest);
      const subject = isTest
        ? `[Test] Cambusa ${slotMeta.label} Plan — ${hh.name}`
        : `${slotMeta.emoji} ${slotMeta.label} Plan — ${hh.name}`;

      try {
        await transporter.sendMail({
          from: sender,
          to: recipient,
          subject,
          html: htmlContent,
          attachments,
        });
        sentCount++;
      } catch (err: any) {
        this.logger.error(`Error sending ${mealSlot} email to ${recipient} for household ${hh.id}:`, err);
        return {
          ok: false,
          message: `SMTP delivery failed: ${err?.message || err}`,
        };
      }
    }

    if (sentCount === 0) {
      return {
        ok: true,
        sentCount: 0,
        message: `No meals planned for ${slotMeta.label} today (skipped).`,
      };
    }

    return {
      ok: true,
      sentCount,
      message: `${slotMeta.label} email successfully delivered to ${recipient} (${sentCount} household${sentCount === 1 ? '' : 's'})`,
    };
  }

  async checkAndSendScheduledNotifications(): Promise<void> {
    if (!this.isConfigured()) return;

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHours}:${currentMinutes}`;
    const todayStr = now.toISOString().slice(0, 10);

    const allSettings = await this.settingsRepo.find();

    for (const settings of allSettings) {
      let user: User | null = null;
      const getUser = async () => {
        if (!user) {
          user = await this.usersRepo.findOne({ where: { id: settings.userId } });
        }
        return user;
      };

      // 1. Daily Morning Digest
      if (
        settings.emailNotificationsEnabled &&
        settings.notificationTime === currentTime &&
        settings.lastNotificationSentDate !== todayStr
      ) {
        const loadedUser = await getUser();
        if (loadedUser) {
          const authUser: AuthUser = {
            id: loadedUser.id,
            subject: loadedUser.subject,
            email: loadedUser.email,
            displayName: loadedUser.displayName,
            pictureUrl: loadedUser.pictureUrl,
          };

          try {
            const nextData = await this.nextService.getNextData(authUser);
            const result = await this.sendDailyDigest(loadedUser, settings, nextData, false);
            if (result.ok) {
              settings.lastNotificationSentDate = todayStr;
              await this.settingsRepo.save(settings);
              this.logger.log(`Morning digest sent to ${loadedUser.email} (${settings.notificationEmail || ''})`);
            }
          } catch (err) {
            this.logger.error(`Failed to execute scheduled morning digest for user ${loadedUser.id}:`, err);
          }
        }
      }

      // 2. Meal Planner Slot Emails
      const slotSettings = normalizeMealPlanEmailSettings(settings.mealPlanEmailSettings);
      const lastSent = { ...(settings.mealPlanEmailLastSent || {}) };
      let slotLastSentUpdated = false;

      for (const slot of Object.keys(MEAL_SLOT_LABELS) as MealSlot[]) {
        const cfg = slotSettings[slot];
        if (!cfg.enabled || cfg.time !== currentTime || lastSent[slot] === todayStr) {
          continue;
        }

        const loadedUser = await getUser();
        if (!loadedUser) break;

        try {
          const result = await this.sendMealSlotNotification(loadedUser, settings, slot, false);
          if (result.ok) {
            lastSent[slot] = todayStr;
            slotLastSentUpdated = true;
            if ((result.sentCount ?? 0) > 0) {
              this.logger.log(`Meal slot '${slot}' email sent to ${loadedUser.email} (${result.sentCount} household(s))`);
            }
          }
        } catch (err) {
          this.logger.error(`Failed to execute scheduled '${slot}' meal email for user ${loadedUser.id}:`, err);
        }
      }

      if (slotLastSentUpdated) {
        settings.mealPlanEmailLastSent = lastSent;
        await this.settingsRepo.save(settings);
      }
    }
  }

  private generateDigestHtml(
    user: User,
    nextData: any,
    pictureMap: Map<string, string>,
    isTest: boolean,
  ): string {
    const frontendBaseUrl = (process.env.OIDC_FRONTEND_REDIRECT_BASE_URL || 'http://localhost:4200').replace(/\/$/, '');
    const householdName = nextData.household?.name || 'Your Home';
    const summary = nextData.summary;

    const renderItemCard = (item: any, isExpired: boolean) => {
      const cid = pictureMap.get(item.productId);
      const productDetailUrl = `${frontendBaseUrl}/home?openProduct=${encodeURIComponent(item.productId)}${nextData.household?.id ? `&householdId=${encodeURIComponent(nextData.household.id)}` : ''}`;

      const imgHtml = cid
        ? `<a href="${productDetailUrl}" target="_blank" style="text-decoration: none; display: block;"><img src="cid:${cid}" alt="${item.productName}" width="50" height="50" style="border-radius: 6px; object-fit: cover; display: block; border: 1px solid #e2e8f0;" /></a>`
        : `<a href="${productDetailUrl}" target="_blank" style="text-decoration: none; display: block;"><div style="width: 50px; height: 50px; border-radius: 6px; background-color: #f1f5f9; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 22px; text-align: center; line-height: 50px;" title="No photo">📦</div></a>`;

      const badgeColor = isExpired ? '#dc2626' : '#d97706';
      const badgeBg = isExpired ? '#fef2f2' : '#fffbeb';
      const badgeBorder = isExpired ? '#fca5a5' : '#fcd34d';
      const badgeText = isExpired
        ? `Expired ${item.daysOverdue}d ago`
        : item.daysRemaining === 0
          ? 'Expires Today!'
          : item.daysRemaining === 1
            ? 'Expires Tomorrow'
            : `Expires in ${item.daysRemaining} days`;

      return `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; padding: 10px;">
          <tr>
            <td width="58" valign="middle" style="padding-right: 10px;">
              ${imgHtml}
            </td>
            <td valign="middle">
              <div style="font-size: 15px; font-weight: 700; margin-bottom: 2px;">
                <a href="${productDetailUrl}" target="_blank" style="text-decoration: none;">
                  ${item.productName} ↗
                </a>
                ${item.isOpened ? '<span style="font-size: 11px; background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; border-radius: 4px; padding: 1px 5px; margin-left: 6px;">Opened</span>' : ''}
              </div>
              <div style="font-size: 13px; opacity: 0.8; margin-bottom: 4px;">
                <strong>${item.amount}</strong> ${item.quantityUnit} • 📍 ${item.location} • BBD: ${item.bestBeforeDate}
              </div>
              <div>
                <a href="${productDetailUrl}" target="_blank" style="display: inline-block; font-size: 12px; font-weight: 600; text-decoration: underline;">
                  Manage in Pantry →
                </a>
              </div>
            </td>
            <td width="130" align="right" valign="top">
              <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 700; border-radius: 16px; color: ${badgeColor}; background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; white-space: nowrap;">
                ${badgeText}
              </span>
            </td>
          </tr>
        </table>
      `;
    };

    const expiredList = nextData.expired?.map((i: any) => renderItemCard(i, true)).join('') || '';
    const expiringList = nextData.expiringSoon?.map((i: any) => renderItemCard(i, false)).join('') || '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cambusa Morning Digest</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 24px 28px; border-bottom: 1px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #059669; margin-bottom: 4px;">
                      ${isTest ? '🧪 TEST NOTIFICATION • ' : ''}MORNING PANTRY DIGEST
                    </div>
                    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 4px 0;">
                      Hello ${user.displayName}! 👋
                    </h1>
                    <div style="font-size: 14px; opacity: 0.85;">
                      Here is the pantry status for <strong>${householdName}</strong> today.
                    </div>
                  </td>
                  <td align="right" valign="top" width="48">
                    <div style="width: 44px; height: 44px; border-radius: 10px; background-color: #ecfdf5; border: 1px solid #a7f3d0; text-align: center; line-height: 44px; font-size: 24px;">
                      🥫
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Summary Metric Cards -->
          <tr>
            <td style="padding: 20px 28px 10px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td width="31%" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; opacity: 0.7;">Distinct Items</div>
                    <div style="font-size: 22px; font-weight: 800; color: #0284c7; margin: 3px 0;">${summary.totalUniqueProductsInStock}</div>
                    <div style="font-size: 11px; opacity: 0.75;">${summary.totalStockItems} total units</div>
                  </td>
                  <td width="3.5%"></td>
                  <td width="31%" style="border: 1px solid ${summary.expiringSoonCount > 0 ? '#f59e0b' : '#e2e8f0'}; border-radius: 8px; padding: 12px; text-align: center; ${summary.expiringSoonCount > 0 ? 'background-color: #fffbeb;' : ''}">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #d97706;">Expiring Soon</div>
                    <div style="font-size: 22px; font-weight: 800; color: #d97706; margin: 3px 0;">${summary.expiringSoonCount}</div>
                    <div style="font-size: 11px; opacity: 0.75;">Within ${summary.configuredDays} days</div>
                  </td>
                  <td width="3.5%"></td>
                  <td width="31%" style="border: 1px solid ${summary.expiredCount > 0 ? '#ef4444' : '#e2e8f0'}; border-radius: 8px; padding: 12px; text-align: center; ${summary.expiredCount > 0 ? 'background-color: #fef2f2;' : ''}">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #dc2626;">Expired</div>
                    <div style="font-size: 22px; font-weight: 800; color: #dc2626; margin: 3px 0;">${summary.expiredCount}</div>
                    <div style="font-size: 11px; opacity: 0.75;">Overdue items</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Expired Section -->
          ${
            nextData.expired && nextData.expired.length > 0
              ? `
          <tr>
            <td style="padding: 14px 28px 6px 28px;">
              <h2 style="font-size: 15px; font-weight: 700; color: #dc2626; margin: 0 0 8px 0;">
                ⚠️ Overdue / Expired Products (${nextData.expired.length})
              </h2>
              ${expiredList}
            </td>
          </tr>
          `
              : ''
          }

          <!-- Expiring Soon Section -->
          ${
            nextData.expiringSoon && nextData.expiringSoon.length > 0
              ? `
          <tr>
            <td style="padding: 14px 28px 6px 28px;">
              <h2 style="font-size: 15px; font-weight: 700; color: #d97706; margin: 0 0 8px 0;">
                ⏳ Expiring Soon Products (${nextData.expiringSoon.length})
              </h2>
              ${expiringList}
            </td>
          </tr>
          `
              : ''
          }

          <!-- Everything Fresh State -->
          ${
            (!nextData.expired || nextData.expired.length === 0) &&
            (!nextData.expiringSoon || nextData.expiringSoon.length === 0)
              ? `
          <tr>
            <td style="padding: 28px; text-align: center;">
              <div style="font-size: 32px; margin-bottom: 6px;">🎉</div>
              <h3 style="font-size: 17px; font-weight: 700; color: #059669; margin: 0 0 4px 0;">All Good!</h3>
              <p style="font-size: 13px; opacity: 0.8; margin: 0;">No products in your pantry are expired or due within ${summary.configuredDays} days.</p>
            </td>
          </tr>
          `
              : ''
          }

          <!-- Call to Action Button -->
          <tr>
            <td align="center" style="padding: 20px 28px 24px 28px;">
              <a href="${frontendBaseUrl}/home" target="_blank" style="display: inline-block; padding: 11px 24px; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; border-radius: 6px;">
                Open Cambusa Dashboard →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 28px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; opacity: 0.75;">
              Cambusa Smart Pantry • Automatic Morning Digest<br>
              To change your notification time or turn off alerts, visit your <a href="${frontendBaseUrl}/profile" style="text-decoration: underline;">Profile Settings</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  private generateMealSlotHtml(
    user: User,
    household: { id: string; name: string },
    mealSlot: MealSlot,
    items: Array<{
      entryId: string;
      productId: string;
      productName: string;
      amount: number;
      quantityUnit: string;
      location: string;
      bestBeforeDate: string | null;
      isOpened: boolean;
      inStock: boolean;
    }>,
    pictureMap: Map<string, string>,
    isTest: boolean,
  ): string {
    const frontendBaseUrl = (process.env.OIDC_FRONTEND_REDIRECT_BASE_URL || 'http://localhost:4200').replace(/\/$/, '');
    const slotMeta = MEAL_SLOT_LABELS[mealSlot];

    const renderMealItemCard = (item: (typeof items)[number]) => {
      const cid = pictureMap.get(item.productId);
      const productDetailUrl = `${frontendBaseUrl}/home?openProduct=${encodeURIComponent(item.productId)}&householdId=${encodeURIComponent(household.id)}`;

      const imgHtml = cid
        ? `<a href="${productDetailUrl}" target="_blank" style="text-decoration: none; display: block;"><img src="cid:${cid}" alt="${item.productName}" width="50" height="50" style="border-radius: 6px; object-fit: cover; display: block; border: 1px solid #e2e8f0;" /></a>`
        : `<a href="${productDetailUrl}" target="_blank" style="text-decoration: none; display: block;"><div style="width: 50px; height: 50px; border-radius: 6px; background-color: #f1f5f9; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 22px; text-align: center; line-height: 50px;" title="No photo">📦</div></a>`;

      const badgeColor = item.inStock ? '#059669' : '#dc2626';
      const badgeBg = item.inStock ? '#ecfdf5' : '#fef2f2';
      const badgeBorder = item.inStock ? '#a7f3d0' : '#fca5a5';
      const badgeText = item.inStock ? 'In Stock' : 'Out of Stock';

      const stockLine = item.inStock
        ? `<strong>${item.amount}</strong> ${item.quantityUnit} • 📍 ${item.location}${item.bestBeforeDate ? ` • BBD: ${item.bestBeforeDate}` : ''}`
        : `📍 ${item.location} • Not currently in stock`;

      return `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; padding: 10px;">
          <tr>
            <td width="58" valign="middle" style="padding-right: 10px;">
              ${imgHtml}
            </td>
            <td valign="middle">
              <div style="font-size: 15px; font-weight: 700; margin-bottom: 2px;">
                <a href="${productDetailUrl}" target="_blank" style="text-decoration: none;">
                  ${item.productName} ↗
                </a>
                ${item.isOpened ? '<span style="font-size: 11px; background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; border-radius: 4px; padding: 1px 5px; margin-left: 6px;">Opened</span>' : ''}
              </div>
              <div style="font-size: 13px; opacity: 0.8; margin-bottom: 4px;">
                ${stockLine}
              </div>
              <div>
                <a href="${productDetailUrl}" target="_blank" style="display: inline-block; font-size: 12px; font-weight: 600; text-decoration: underline;">
                  Manage in Pantry →
                </a>
              </div>
            </td>
            <td width="130" align="right" valign="top">
              <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 700; border-radius: 16px; color: ${badgeColor}; background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; white-space: nowrap;">
                ${badgeText}
              </span>
            </td>
          </tr>
        </table>
      `;
    };

    const itemsHtml = items.map(renderMealItemCard).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cambusa ${slotMeta.label} Plan</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 24px 28px; border-bottom: 1px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #059669; margin-bottom: 4px;">
                      ${isTest ? '🧪 TEST NOTIFICATION • ' : ''}MEAL PLANNER • ${slotMeta.label.toUpperCase()}
                    </div>
                    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 4px 0;">
                      Hello ${user.displayName}! 👋
                    </h1>
                    <div style="font-size: 14px; opacity: 0.85;">
                      Here is what is planned for <strong>${slotMeta.label}</strong> today in <strong>${household.name}</strong>.
                    </div>
                  </td>
                  <td align="right" valign="top" width="48">
                    <div style="width: 44px; height: 44px; border-radius: 10px; background-color: #ecfdf5; border: 1px solid #a7f3d0; text-align: center; line-height: 44px; font-size: 24px;">
                      ${slotMeta.emoji}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${
            items.length > 0
              ? `
          <tr>
            <td style="padding: 20px 28px 6px 28px;">
              <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 10px 0;">
                ${slotMeta.emoji} Planned Items (${items.length})
              </h2>
              ${itemsHtml}
            </td>
          </tr>
          `
              : `
          <tr>
            <td style="padding: 28px; text-align: center;">
              <div style="font-size: 32px; margin-bottom: 6px;">${slotMeta.emoji}</div>
              <h3 style="font-size: 17px; font-weight: 700; color: #059669; margin: 0 0 4px 0;">No Meals Planned</h3>
              <p style="font-size: 13px; opacity: 0.8; margin: 0;">Nothing is currently scheduled for ${slotMeta.label} today in ${household.name}.</p>
            </td>
          </tr>
          `
          }

          <tr>
            <td align="center" style="padding: 20px 28px 24px 28px;">
              <a href="${frontendBaseUrl}/planner" target="_blank" style="display: inline-block; padding: 11px 24px; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; border-radius: 6px;">
                Open Meal Planner →
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding: 16px 28px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; opacity: 0.75;">
              Cambusa Smart Pantry • Meal Planner Notification<br>
              To change your notification schedule or turn off alerts, visit your <a href="${frontendBaseUrl}/profile" style="text-decoration: underline;">Profile Settings</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }
}
