import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { ApiKeyDto, CreatedApiKeyDto, ProfileDataDto } from '../../core/models.js';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal.component.js';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);

  readonly profileData = signal<ProfileDataDto | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly isSavingSettings = signal<boolean>(false);
  readonly isTestingMealie = signal<boolean>(false);
  readonly mealieTestStatus = signal<{ ok: boolean; message: string } | null>(null);

  // Form inputs
  readonly nextExpiringDays = signal<number>(5);
  readonly mealieUrl = signal<string>('');
  readonly mealieToken = signal<string>('');

  // Notification settings inputs
  readonly notificationEmail = signal<string>('');
  readonly emailNotificationsEnabled = signal<boolean>(false);
  readonly notificationTime = signal<string>('06:00');
  readonly isSavingNotifications = signal<boolean>(false);
  readonly isTestingNotification = signal<boolean>(false);
  readonly notificationTestStatus = signal<{ ok: boolean; message: string } | null>(null);

  // API Key creation modal & feedback
  readonly showCreateKeyModal = signal<boolean>(false);
  readonly newKeyName = signal<string>('');
  readonly createdKey = signal<CreatedApiKeyDto | null>(null);
  readonly copied = signal<boolean>(false);

  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  ngOnInit() {
    this.loadProfile();
  }

  async loadProfile() {
    this.isLoading.set(true);
    try {
      const data = await this.api.getProfile();
      this.profileData.set(data);
      this.nextExpiringDays.set(data.settings.nextExpiringDays);
      this.mealieUrl.set(data.settings.mealieUrl || '');
      this.mealieToken.set('');
      this.notificationEmail.set(data.settings.notificationEmail || '');
      this.emailNotificationsEnabled.set(Boolean(data.settings.emailNotificationsEnabled));
      this.notificationTime.set(data.settings.notificationTime || '06:00');
    } catch {
      this.showToast('error', 'Failed to load user profile data');
    } finally {
      this.isLoading.set(false);
    }
  }

  async saveNextSettings() {
    const days = Number(this.nextExpiringDays());
    if (isNaN(days) || days < 1 || days > 365) {
      this.showToast('error', 'Days must be a valid number between 1 and 365');
      return;
    }

    this.isSavingSettings.set(true);
    try {
      const updated = await this.api.updateProfileSettings({ nextExpiringDays: days });
      this.nextExpiringDays.set(updated.nextExpiringDays);
      this.showToast('success', 'Next engine settings updated successfully');
    } catch {
      this.showToast('error', 'Failed to update Next engine settings');
    } finally {
      this.isSavingSettings.set(false);
    }
  }

  async saveMealieSettings() {
    this.isSavingSettings.set(true);
    try {
      const payload: { mealieUrl?: string | null; mealieApiToken?: string | null } = {
        mealieUrl: this.mealieUrl().trim() || null,
      };
      if (this.mealieToken().trim()) {
        payload.mealieApiToken = this.mealieToken().trim();
      }

      const updated = await this.api.updateProfileSettings(payload);
      if (this.profileData()) {
        this.profileData.update((p) => (p ? { ...p, settings: updated } : null));
      }
      this.mealieToken.set('');
      this.showToast('success', 'Mealie integration settings saved');
    } catch {
      this.showToast('error', 'Failed to save Mealie settings');
    } finally {
      this.isSavingSettings.set(false);
    }
  }

  async testMealieConnection() {
    const url = this.mealieUrl().trim();
    const token = this.mealieToken().trim();

    if (!url) {
      this.mealieTestStatus.set({ ok: false, message: 'Mealie instance URL is required' });
      return;
    }

    this.isTestingMealie.set(true);
    this.mealieTestStatus.set(null);

    try {
      const res = await this.api.testMealie({ url, token });
      if (res.ok) {
        const recipeText = res.recipeCount !== undefined ? ` (${res.recipeCount} recipes available)` : '';
        this.mealieTestStatus.set({
          ok: true,
          message: `Connection successful! Mealie version: ${res.version || 'OK'}${recipeText}`,
        });
      } else {
        this.mealieTestStatus.set({
          ok: false,
          message: res.error || 'Connection failed: could not authenticate with Mealie instance',
        });
      }
    } catch (err: any) {
      this.mealieTestStatus.set({
        ok: false,
        message: err?.message || 'Network error connecting to Mealie endpoint',
      });
    } finally {
      this.isTestingMealie.set(false);
    }
  }

  async saveNotificationSettings() {
    const time = this.notificationTime()?.trim() || '06:00';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      this.showToast('error', 'Notification time must be in 24-hour format HH:MM (e.g. 06:00)');
      return;
    }

    this.isSavingNotifications.set(true);
    try {
      const email = this.notificationEmail()?.trim() || null;
      const updated = await this.api.updateProfileSettings({
        notificationEmail: email,
        emailNotificationsEnabled: this.emailNotificationsEnabled(),
        notificationTime: time,
      });

      if (this.profileData()) {
        this.profileData.update((p) => (p ? { ...p, settings: updated } : null));
      }
      this.showToast('success', 'Email notification settings saved successfully');
    } catch {
      this.showToast('error', 'Failed to save email notification settings');
    } finally {
      this.isSavingNotifications.set(false);
    }
  }

  async testNotification() {
    this.isTestingNotification.set(true);
    this.notificationTestStatus.set(null);
    try {
      const res = await this.api.testNotification();
      if (res.ok) {
        this.notificationTestStatus.set({
          ok: true,
          message: res.message || 'Test notification sent! Please check your inbox.',
        });
        this.showToast('success', 'Test email dispatched successfully!');
      } else {
        this.notificationTestStatus.set({
          ok: false,
          message: res.message || 'Failed to send test email',
        });
        this.showToast('error', res.message || 'Failed to send test email');
      }
    } catch (err: any) {
      const msg = err?.error?.message || err?.message || 'Error triggering test notification';
      this.notificationTestStatus.set({ ok: false, message: msg });
      this.showToast('error', msg);
    } finally {
      this.isTestingNotification.set(false);
    }
  }

  openCreateKeyModal() {
    this.newKeyName.set('');
    this.showCreateKeyModal.set(true);
  }

  closeCreateKeyModal() {
    this.showCreateKeyModal.set(false);
  }

  async confirmCreateKey() {
    const name = this.newKeyName().trim();
    if (!name) {
      this.showToast('error', 'API Key name is required');
      return;
    }

    try {
      const res = await this.api.createApiKey(name);
      this.createdKey.set(res);
      this.closeCreateKeyModal();
      this.copied.set(false);
      await this.loadProfile();
    } catch {
      this.showToast('error', 'Failed to generate API Key');
    }
  }

  async copyRawKey() {
    const key = this.createdKey()?.rawKey;
    if (!key) return;

    try {
      await navigator.clipboard.writeText(key);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 3000);
    } catch {
      this.showToast('error', 'Could not copy to clipboard automatically');
    }
  }

  dismissCreatedKey() {
    this.createdKey.set(null);
  }

  async revokeApiKey(key: ApiKeyDto) {
    const ref = this.dialog.open(ConfirmModalComponent, {
      data: {
        title: 'Revoke API Key',
        message: `Are you sure you want to revoke "${key.name}" (${key.keyPrefix})? Any integrations using this key will immediately lose access.`,
        confirmLabel: 'Revoke Key',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await ref.closed.toPromise();
    if (!confirmed) return;

    try {
      await this.api.revokeApiKey(key.id);
      this.showToast('success', `API Key "${key.name}" revoked`);
      await this.loadProfile();
    } catch {
      this.showToast('error', 'Failed to revoke API key');
    }
  }

  private showToast(type: 'success' | 'error', message: string) {
    this.toast.set({ type, message });
    setTimeout(() => {
      this.toast.set(null);
    }, 4000);
  }
}
