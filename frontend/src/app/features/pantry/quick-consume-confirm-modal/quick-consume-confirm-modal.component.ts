import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { LucideCheck, LucideClock, LucidePackageOpen, LucideUtensils, LucideX } from '@lucide/angular';
import { Product, StockItem } from '../../../core/models.js';
import { LocalDatePipe } from '../../../shared/pipes/local-date.pipe.js';

export interface QuickConsumeConfirmData {
  product: Product;
  stockItem: StockItem;
  timerSeconds?: number;
}

export type QuickConsumeConfirmAction = 'consume' | 'open' | 'cancel';

@Component({
  selector: 'app-quick-consume-confirm-modal',
  standalone: true,
  imports: [CommonModule, LucideClock, LucideUtensils, LucidePackageOpen, LucideCheck, LucideX, LocalDatePipe],
  templateUrl: './quick-consume-confirm-modal.component.html',
  styleUrl: './quick-consume-confirm-modal.component.scss',
})
export class QuickConsumeConfirmModalComponent implements OnInit, OnDestroy {
  readonly data = inject<QuickConsumeConfirmData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<QuickConsumeConfirmAction>);
  private readonly ngZone = inject(NgZone);

  readonly totalSeconds =
    this.data?.timerSeconds && Number(this.data.timerSeconds) > 0
      ? Number(this.data.timerSeconds)
      : 10;
  readonly remainingSeconds = signal<number>(this.totalSeconds);
  readonly progressPercent = signal<number>(100);

  private intervalId: any = null;

  ngOnInit(): void {
    const startTime = Date.now();
    const durationMs = this.totalSeconds * 1000;

    this.intervalId = setInterval(() => {
      this.ngZone.run(() => {
        if (!this.intervalId) return;

        const elapsed = Date.now() - startTime;
        const leftMs = Math.max(0, durationMs - elapsed);
        const leftSec = Math.ceil(leftMs / 1000);

        this.remainingSeconds.set(leftSec);
        this.progressPercent.set((leftMs / durationMs) * 100);

        if (leftMs <= 0) {
          this.confirm();
        }
      });
    }, 100);
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  confirm(): void {
    this.clearTimer();
    this.ngZone.run(() => {
      this.dialogRef.close('consume');
    });
  }

  markAsOpen(): void {
    this.clearTimer();
    this.ngZone.run(() => {
      this.dialogRef.close('open');
    });
  }

  cancel(): void {
    this.clearTimer();
    this.ngZone.run(() => {
      this.dialogRef.close('cancel');
    });
  }

  private clearTimer(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
