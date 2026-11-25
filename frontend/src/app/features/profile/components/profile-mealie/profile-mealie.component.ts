import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAlertTriangle, LucideCheck, LucidePlug, LucideUtensils } from '@lucide/angular';
import { ApiService } from '../../../../core/api.service.js';
import { UserSettingsDto } from '../../../../core/models.js';

@Component({
  selector: 'app-profile-mealie',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAlertTriangle, LucideCheck, LucidePlug, LucideUtensils],
  templateUrl: './profile-mealie.component.html',
  styleUrl: './profile-mealie.component.scss',
})
export class ProfileMealieComponent {
  private readonly api = inject(ApiService);

  readonly settings = input<UserSettingsDto | null | undefined>();

  readonly mealieUrl = signal<string>('');
  readonly mealieToken = signal<string>('');
  readonly isSaving = signal<boolean>(false);
  readonly isTesting = signal<boolean>(false);
  readonly testStatus = signal<{ ok: boolean; message: string } | null>(null);

  readonly toast = output<{ type: 'success' | 'error'; message: string }>();
  readonly settingsUpdated = output<UserSettingsDto>();

  constructor() {
    effect(() => {
      const s = this.settings();
      if (s) {
        this.mealieUrl.set(s.mealieUrl || '');
        this.mealieToken.set('');
      }
    });
  }

  async testMealieConnection(): Promise<void> {
    const url = this.mealieUrl().trim();
    if (!url) return;

    this.isTesting.set(true);
    this.testStatus.set(null);

    try {
      const res = await this.api.testMealie({
        url,
        token: this.mealieToken().trim(),
      });
      const message = res.ok
        ? `Connected to Mealie v${res.version || 'unknown'} (${res.recipeCount ?? 0} recipes found)`
        : (res.error || 'Connection failed');
      this.testStatus.set({ ok: res.ok, message });
      if (res.ok) {
        this.toast.emit({ type: 'success', message: 'Mealie connection test succeeded' });
      } else {
        this.toast.emit({ type: 'error', message });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      this.testStatus.set({ ok: false, message: msg });
      this.toast.emit({ type: 'error', message: 'Mealie test connection failed' });
    } finally {
      this.isTesting.set(false);
    }
  }

  async saveMealieSettings(): Promise<void> {
    this.isSaving.set(true);
    try {
      const dto: { mealieUrl: string | null; mealieApiToken?: string } = {
        mealieUrl: this.mealieUrl().trim() || null,
      };
      if (this.mealieToken().trim()) {
        dto.mealieApiToken = this.mealieToken().trim();
      }

      const updated = await this.api.updateProfileSettings(dto);
      this.toast.emit({ type: 'success', message: 'Mealie configuration updated' });
      this.settingsUpdated.emit(updated);
    } catch {
      this.toast.emit({ type: 'error', message: 'Failed to update Mealie settings' });
    } finally {
      this.isSaving.set(false);
    }
  }
}
