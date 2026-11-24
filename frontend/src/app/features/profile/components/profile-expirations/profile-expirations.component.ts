import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideZap, LucideClock } from '@lucide/angular';
import { ApiService } from '../../../../core/api.service.js';
import { NumberStepperComponent } from '../../../../shared/components/number-stepper/number-stepper.component.js';

@Component({
  selector: 'app-profile-expirations',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideZap, LucideClock, NumberStepperComponent],
  templateUrl: './profile-expirations.component.html',
  styleUrl: './profile-expirations.component.scss',
})
export class ProfileExpirationsComponent {
  private readonly api = inject(ApiService);

  readonly initialDays = input<number>(5);
  readonly initialTimerSeconds = input<number>(10);

  readonly days = signal<number>(5);
  readonly timerSeconds = signal<number>(10);

  readonly isSaving = signal<boolean>(false);
  readonly isSavingTimer = signal<boolean>(false);

  onTimerValueChange(val: number | null | undefined): void {
    this.timerSeconds.set(val ?? 10);
  }

  readonly toast = output<{ type: 'success' | 'error'; message: string }>();
  readonly daysChanged = output<number>();
  readonly timerChanged = output<number>();

  constructor() {
    effect(() => {
      this.days.set(this.initialDays());
    });
    effect(() => {
      this.timerSeconds.set(this.initialTimerSeconds());
    });
  }

  async saveSettings(): Promise<void> {
    const val = Number(this.days());
    if (isNaN(val) || val < 1 || val > 365) {
      this.toast.emit({ type: 'error', message: 'Days must be a number between 1 and 365' });
      return;
    }

    this.isSaving.set(true);
    try {
      const updated = await this.api.updateProfileSettings({ nextExpiringDays: val });
      this.days.set(updated.nextExpiringDays);
      this.daysChanged.emit(updated.nextExpiringDays);
      this.toast.emit({ type: 'success', message: 'Next engine settings updated successfully' });
    } catch {
      this.toast.emit({ type: 'error', message: 'Failed to update Next engine settings' });
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveTimerSettings(): Promise<void> {
    const val = Number(this.timerSeconds());
    if (isNaN(val) || val < 1 || val > 120) {
      this.toast.emit({ type: 'error', message: 'Countdown timer must be between 1 and 120 seconds' });
      return;
    }

    this.isSavingTimer.set(true);
    try {
      const updated = await this.api.updateProfileSettings({ quickConsumeTimerSeconds: val });
      if (updated.quickConsumeTimerSeconds) {
        this.timerSeconds.set(updated.quickConsumeTimerSeconds);
        this.timerChanged.emit(updated.quickConsumeTimerSeconds);
      }
      this.toast.emit({ type: 'success', message: 'Quick consume timer setting updated successfully' });
    } catch {
      this.toast.emit({ type: 'error', message: 'Failed to update quick consume timer setting' });
    } finally {
      this.isSavingTimer.set(false);
    }
  }
}
