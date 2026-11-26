import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAlertTriangle, LucideBell, LucideCalendar, LucideCheck, LucideMail } from '@lucide/angular';
import { ApiService } from '../../../../core/api.service.js';
import {
  MEAL_SLOTS,
  MealPlanEmailSettingsMap,
  MealSlot,
  MealSlotConfig,
  MealSlotEmailConfig,
  UserSettingsDto,
} from '../../../../core/models.js';

function createDefaultMealSlotSettings(): MealPlanEmailSettingsMap {
  return {
    breakfast: { enabled: false, time: '07:30', onlyIfHasEntries: true },
    morning_snack: { enabled: false, time: '10:00', onlyIfHasEntries: true },
    lunch: { enabled: false, time: '12:00', onlyIfHasEntries: true },
    afternoon_snack: { enabled: false, time: '16:00', onlyIfHasEntries: true },
    dinner: { enabled: false, time: '19:00', onlyIfHasEntries: true },
  };
}

@Component({
  selector: 'app-profile-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAlertTriangle, LucideBell, LucideCalendar, LucideCheck, LucideMail],
  templateUrl: './profile-notifications.component.html',
  styleUrl: './profile-notifications.component.scss',
})
export class ProfileNotificationsComponent {
  private readonly api = inject(ApiService);

  readonly settings = input<UserSettingsDto | null | undefined>();
  readonly accountEmail = input<string | null | undefined>('');
  readonly mealSlots: MealSlotConfig[] = MEAL_SLOTS;

  readonly emailNotificationsEnabled = signal<boolean>(false);
  readonly notificationTime = signal<string>('06:00');
  readonly notificationEmail = signal<string>('');
  readonly mealPlanEmailSettings = signal<MealPlanEmailSettingsMap>(createDefaultMealSlotSettings());
  readonly isSaving = signal<boolean>(false);
  readonly isSavingEmail = signal<boolean>(false);
  readonly isSavingMealSlots = signal<boolean>(false);
  readonly isTesting = signal<boolean>(false);
  readonly testingSlot = signal<MealSlot | null>(null);
  readonly testStatus = signal<{ ok: boolean; message: string } | null>(null);
  readonly mealSlotTestStatus = signal<{ ok: boolean; message: string } | null>(null);

  readonly toast = output<{ type: 'success' | 'error'; message: string }>();
  readonly settingsUpdated = output<UserSettingsDto>();

  constructor() {
    effect(() => {
      const s = this.settings();
      if (s) {
        this.emailNotificationsEnabled.set(Boolean(s.emailNotificationsEnabled));
        this.notificationTime.set(s.notificationTime || '06:00');
        this.notificationEmail.set(s.notificationEmail || '');
        const defaults = createDefaultMealSlotSettings();
        const merged = { ...defaults };
        if (s.mealPlanEmailSettings) {
          for (const slot of Object.keys(defaults) as MealSlot[]) {
            if (s.mealPlanEmailSettings[slot]) {
              merged[slot] = { ...defaults[slot], ...s.mealPlanEmailSettings[slot] };
            }
          }
        }
        this.mealPlanEmailSettings.set(merged);
      }
    });
  }

  updateMealSlotConfig(slot: MealSlot, patch: Partial<MealSlotEmailConfig>): void {
    this.mealPlanEmailSettings.update((current) => ({
      ...current,
      [slot]: {
        ...current[slot],
        ...patch,
      },
    }));
  }

  async testMealSlot(slot: MealSlot): Promise<void> {
    this.testingSlot.set(slot);
    this.mealSlotTestStatus.set(null);

    try {
      const res = await this.api.testMealSlotNotification(slot);
      this.mealSlotTestStatus.set({ ok: res.ok, message: res.message });
      if (res.ok) {
        this.toast.emit({ type: 'success', message: res.message });
      } else {
        this.toast.emit({ type: 'error', message: res.message });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to dispatch test meal plan email';
      this.mealSlotTestStatus.set({ ok: false, message: msg });
      this.toast.emit({ type: 'error', message: 'Failed to send test meal plan email' });
    } finally {
      this.testingSlot.set(null);
    }
  }

  async saveRecipientEmail(): Promise<void> {
    this.isSavingEmail.set(true);
    try {
      const updated = await this.api.updateProfileSettings({
        notificationEmail: this.notificationEmail().trim() || null,
      });
      this.toast.emit({ type: 'success', message: 'Notification email address updated' });
      this.settingsUpdated.emit(updated);
    } catch {
      this.toast.emit({ type: 'error', message: 'Failed to update notification email address' });
    } finally {
      this.isSavingEmail.set(false);
    }
  }

  async saveMealSlotSettings(): Promise<void> {
    this.isSavingMealSlots.set(true);
    try {
      const updated = await this.api.updateProfileSettings({
        mealPlanEmailSettings: this.mealPlanEmailSettings(),
      });
      this.toast.emit({ type: 'success', message: 'Meal planner notification preferences updated' });
      this.settingsUpdated.emit(updated);
    } catch {
      this.toast.emit({ type: 'error', message: 'Failed to update meal planner notification preferences' });
    } finally {
      this.isSavingMealSlots.set(false);
    }
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
