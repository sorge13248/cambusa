import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import nodemailer from 'nodemailer';
type Transporter = ReturnType<typeof nodemailer.createTransport>;
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { Product, User, UserSettings } from '../entities/index.js';
import { AuthUser } from '../common/auth/auth.types.js';
import { NextService } from './next.service.js';
import { HouseholdsService } from './households.service.js';
import { resolveUploadsDir } from '../load-env.js';

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
    const attachments: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string; cid: string }> = [];

    // Build product picture CID map
    const productPicturesMap = new Map<string, string>();
    const allItems = [...(nextData.expired || []), ...(nextData.expiringSoon || [])];
    const productIds = Array.from(new Set(allItems.map((i: any) => i.productId)));

    if (productIds.length > 0) {
      const products = await this.productsRepo.find({
        where: productIds.map((id) => ({ id })),
      });

      // Also collect parent products in case child product inherits photo from parent
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

      for (const prod of products) {
        let picList: string[] = [];
        if (Array.isArray(prod.pictureFileNames)) {
          picList = prod.pictureFileNames;
        } else if (typeof prod.pictureFileNames === 'string') {
          try {
            const parsed = JSON.parse(prod.pictureFileNames);
            if (Array.isArray(parsed)) picList = parsed;
          } catch {
            picList = [];
          }
        }

        // If product has no picture, look for parent picture
        if (picList.length === 0 && prod.parentProductId) {
          const parent = allProductMap.get(prod.parentProductId);
          if (parent) {
            if (Array.isArray(parent.pictureFileNames)) {
              picList = parent.pictureFileNames;
            } else if (typeof parent.pictureFileNames === 'string') {
              try {
                const parsed = JSON.parse(parent.pictureFileNames);
                if (Array.isArray(parsed)) picList = parsed;
              } catch {
                picList = [];
              }
            }
          }
        }

        if (picList.length > 0) {
          const firstPic = picList[0];
          const localPath = join(uploadsDir, 'products', firstPic);
          if (existsSync(localPath)) {
            const cid = `prod-img-${prod.id}`;
            try {
              // Convert to high-compatibility JPEG thumbnail (120x120 cover, 85% quality)
              // JPEG ensures 100% universal rendering across all desktop & mobile mail clients (including Outlook)
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
    }

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

  async checkAndSendScheduledNotifications(): Promise<void> {
    if (!this.isConfigured()) return;

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHours}:${currentMinutes}`;
    const todayStr = now.toISOString().slice(0, 10);

    const activeSubscriptions = await this.settingsRepo.find({
      where: { emailNotificationsEnabled: true },
    });

    for (const settings of activeSubscriptions) {
      if (settings.notificationTime === currentTime && settings.lastNotificationSentDate !== todayStr) {
        const user = await this.usersRepo.findOne({ where: { id: settings.userId } });
        if (!user) continue;

        const authUser: AuthUser = {
          id: user.id,
          subject: user.subject,
          email: user.email,
          displayName: user.displayName,
          pictureUrl: user.pictureUrl,
        };

        try {
          const nextData = await this.nextService.getNextData(authUser);
          const result = await this.sendDailyDigest(user, settings, nextData, false);
          if (result.ok) {
            settings.lastNotificationSentDate = todayStr;
            await this.settingsRepo.save(settings);
            this.logger.log(`Morning digest sent to ${user.email} (${settings.notificationEmail || ''})`);
          }
        } catch (err) {
          this.logger.error(`Failed to execute scheduled morning digest for user ${user.id}:`, err);
        }
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
}
