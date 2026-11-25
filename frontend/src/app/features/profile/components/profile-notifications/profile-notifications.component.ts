import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAlertTriangle, LucideBell, LucideCheck, LucideMail } from '@lucide/angular';
import { ApiService } from '../../../../core/api.service.js';
import { UserSettingsDto } from '../../../../core/models.js';

@Component({
  selector: 'app-profile-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAlertTriangle, LucideBell, LucideCheck, LucideMail],
  templateUrl: './profile-notifications.component.html',
  styleUrl: './profile-notifications.component.scss',
})
export class ProfileNotificationsComponent {
  private readonly api = inject(ApiService);

  readonly settings = input<UserSettingsDto | null | undefined>();
  readonly accountEmail = input<string | null | undefined>('');

  readonly emailNotificationsEnabled = signal<boolean>(false);
  readonly notificationTime = signal<string>('06:00');
  readonly notificationEmail = signal<string>('');
  readonly isSaving = signal<boolean>(false);
  readonly isTesting = signal<boolean>(false);
  readonly testStatus = signal<{ ok: boolean; message: string } | null>(null);

  readonly toast = output<{ type: 'success' | 'error'; message: string }>();
  readonly settingsUpdated = output<UserSettingsDto>();

  constructor() {
    effect(() => {
      const s = this.settings();
      if (s) {
        this.emailNotificationsEnabled.set(Boolean(s.emailNotificationsEnabled));
        this.notificationTime.set(s.notificationTime || '06:00');
        this.notificationEmail.set(s.notificationEmail || '');
      }
    });
  }

  async testNotification(): Promise<void> {
    this.isTesting.set(true);
    this.testStatus.set(null);

    try {
      const res = await this.api.testNotification();
      this.testStatus.set({ ok: res.ok, message: res.message });
      if (res.ok) {
        this.toast.emit({ type: 'success', message: 'Test digest email sent successfully' });
      } else {
        this.toast.emit({ type: 'error', message: res.message });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to dispatch test notification';
      this.testStatus.set({ ok: false, message: msg });
      this.toast.emit({ type: 'error', message: 'Failed to send test email' });
    } finally {
      this.isTesting.set(false);
    }
  }

  async saveSettings(): Promise<void> {
    this.isSaving.set(true);
    try {
      const updated = await this.api.updateProfileSettings({
        emailNotificationsEnabled: this.emailNotificationsEnabled(),
        notificationTime: this.notificationTime(),
        notificationEmail: this.notificationEmail().trim() || null,
      });
      this.toast.emit({ type: 'success', message: 'Notification preferences updated' });
      this.settingsUpdated.emit(updated);
    } catch {
      this.toast.emit({ type: 'error', message: 'Failed to update notification preferences' });
    } finally {
      this.isSaving.set(false);
    }
  }
}
