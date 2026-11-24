import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { LucideCheck, LucideClock, LucideUtensils, LucideX } from '@lucide/angular';
import { Product, StockItem } from '../../../core/models.js';
import { LocalDatePipe } from '../../../shared/pipes/local-date.pipe.js';

export interface QuickConsumeConfirmData {
  product: Product;
  stockItem: StockItem;
  timerSeconds?: number;
}

@Component({
  selector: 'app-quick-consume-confirm-modal',
  standalone: true,
  imports: [CommonModule, LucideClock, LucideUtensils, LucideCheck, LucideX, LocalDatePipe],
  templateUrl: './quick-consume-confirm-modal.component.html',
  styleUrl: './quick-consume-confirm-modal.component.scss',
})
export class QuickConsumeConfirmModalComponent implements OnInit, OnDestroy {
  readonly data = inject<QuickConsumeConfirmData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<boolean>);

  readonly totalSeconds = this.data?.timerSeconds && this.data.timerSeconds > 0 ? this.data.timerSeconds : 10;
  readonly remainingSeconds = signal<number>(this.totalSeconds);
  readonly progressPercent = signal<number>(100);

  private intervalId: any = null;

  ngOnInit(): void {
    const startTime = Date.now();
    const durationMs = this.totalSeconds * 1000;

    this.intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const leftMs = Math.max(0, durationMs - elapsed);
      const leftSec = Math.ceil(leftMs / 1000);

      this.remainingSeconds.set(leftSec);
      this.progressPercent.set((leftMs / durationMs) * 100);

      if (leftMs <= 0) {
        this.confirm();
      }
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  confirm(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.dialogRef.close(true);
  }

  cancel(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.dialogRef.close(false);
  }
}
