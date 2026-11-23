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
        ? `<a href="${productDetailUrl}" target="_blank" style="text-decoration: none; display: block;"><img src="cid:${cid}" alt="${item.productName}" width="54" height="54" style="border-radius: 8px; object-fit: cover; display: block; border: 1px solid #334155;" /></a>`
        : `<a href="${productDetailUrl}" target="_blank" style="text-decoration: none; display: block;"><div style="width: 54px; height: 54px; border-radius: 8px; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border: 1px solid #475569; display: flex; align-items: center; justify-content: center; font-size: 24px; text-align: center; line-height: 54px;" title="No photo">📦</div></a>`;

      const badgeColor = isExpired ? '#ef4444' : '#f59e0b';
      const badgeBg = isExpired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)';
      const badgeText = isExpired
        ? `Expired ${item.daysOverdue}d ago`
        : item.daysRemaining === 0
          ? 'Expires Today!'
          : item.daysRemaining === 1
            ? 'Expires Tomorrow'
            : `Expires in ${item.daysRemaining} days`;

      return `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #162032; border: 1px solid #23354d; border-radius: 10px; margin-bottom: 10px; padding: 12px;">
          <tr>
            <td width="64" valign="middle" style="padding-right: 12px;">
              ${imgHtml}
            </td>
            <td valign="middle">
              <div style="font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">
                <a href="${productDetailUrl}" target="_blank" style="color: #f8fafc; text-decoration: none;">
                  ${item.productName} ↗
                </a>
                ${item.isOpened ? '<span style="font-size: 11px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; border-radius: 4px; padding: 1px 5px; margin-left: 6px;">Opened</span>' : ''}
              </div>
              <div style="font-size: 13px; color: #94a3b8; margin-bottom: 6px;">
                <strong>${item.amount}</strong> ${item.quantityUnit} • 📍 ${item.location} • BBD: ${item.bestBeforeDate}
              </div>
              <div>
                <a href="${productDetailUrl}" target="_blank" style="display: inline-block; padding: 3px 8px; font-size: 11px; font-weight: 600; color: #38bdf8; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 4px; text-decoration: none;">
                  Manage in Pantry →
                </a>
              </div>
            </td>
            <td width="130" align="right" valign="top">
              <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 700; border-radius: 20px; color: ${badgeColor}; background-color: ${badgeBg}; border: 1px solid ${badgeColor}; white-space: nowrap;">
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
<body style="margin: 0; padding: 0; background-color: #0b1120; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b1120; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; background-color: #0f172a; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 28px 32px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(56, 189, 248, 0.2) 100%); border-bottom: 1px solid #334155;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #34d399; margin-bottom: 4px;">
                      ${isTest ? '🧪 TEST NOTIFICATION • ' : ''}MORNING PANTRY DIGEST
                    </div>
                    <h1 style="font-size: 24px; font-weight: 800; color: #f8fafc; margin: 0 0 6px 0;">
                      Hello ${user.displayName}! 👋
                    </h1>
                    <div style="font-size: 14px; color: #94a3b8;">
                      Here is the pantry status for <strong>${householdName}</strong> today.
                    </div>
                  </td>
                  <td align="right" valign="top" width="60">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #10b981 0%, #38bdf8 100%); text-align: center; line-height: 48px; font-size: 26px;">
                      🥫
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Summary Metric Cards -->
          <tr>
            <td style="padding: 24px 32px 12px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td width="31%" style="background-color: #162032; border: 1px solid #23354d; border-radius: 10px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b;">Distinct Items</div>
                    <div style="font-size: 24px; font-weight: 800; color: #38bdf8; margin: 4px 0;">${summary.totalUniqueProductsInStock}</div>
                    <div style="font-size: 11px; color: #94a3b8;">${summary.totalStockItems} total units</div>
                  </td>
                  <td width="3.5%"></td>
                  <td width="31%" style="background-color: #162032; border: 1px solid ${summary.expiringSoonCount > 0 ? '#b45309' : '#23354d'}; border-radius: 10px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #f59e0b;">Expiring Soon</div>
                    <div style="font-size: 24px; font-weight: 800; color: #f59e0b; margin: 4px 0;">${summary.expiringSoonCount}</div>
                    <div style="font-size: 11px; color: #94a3b8;">Within ${summary.configuredDays} days</div>
                  </td>
                  <td width="3.5%"></td>
                  <td width="31%" style="background-color: #162032; border: 1px solid ${summary.expiredCount > 0 ? '#b91c1c' : '#23354d'}; border-radius: 10px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #ef4444;">Expired</div>
                    <div style="font-size: 24px; font-weight: 800; color: #ef4444; margin: 4px 0;">${summary.expiredCount}</div>
                    <div style="font-size: 11px; color: #94a3b8;">Overdue items</div>
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
            <td style="padding: 16px 32px 8px 32px;">
              <h2 style="font-size: 16px; font-weight: 700; color: #ef4444; margin: 0 0 10px 0; display: flex; align-items: center;">
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
            <td style="padding: 16px 32px 8px 32px;">
              <h2 style="font-size: 16px; font-weight: 700; color: #f59e0b; margin: 0 0 10px 0; display: flex; align-items: center;">
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
            <td style="padding: 32px; text-align: center;">
              <div style="font-size: 36px; margin-bottom: 8px;">🎉</div>
              <h3 style="font-size: 18px; font-weight: 700; color: #10b981; margin: 0 0 6px 0;">All Good!</h3>
              <p style="font-size: 14px; color: #94a3b8; margin: 0;">No products in your pantry are expired or due within ${summary.configuredDays} days.</p>
            </td>
          </tr>
          `
              : ''
          }

          <!-- Call to Action Button -->
          <tr>
            <td align="center" style="padding: 24px 32px 32px 32px;">
              <a href="${frontendBaseUrl}/home" target="_blank" style="display: inline-block; padding: 12px 28px; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; border-radius: 8px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
                Open Cambusa Dashboard →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 18px 32px; background-color: #0b1120; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
              Cambusa Smart Pantry • Automatic Morning Digest<br>
              To change your notification time or turn off alerts, visit your <a href="${frontendBaseUrl}/profile" style="color: #38bdf8; text-decoration: none;">Profile Settings</a>.
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
