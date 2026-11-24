import { CommonModule } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideMinus, LucidePlus } from '@lucide/angular';

@Component({
  selector: 'app-number-stepper',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideMinus, LucidePlus],
  templateUrl: './number-stepper.component.html',
  styleUrl: './number-stepper.component.scss',
})
export class NumberStepperComponent {
  readonly value = model<number | null | undefined>(1);
  readonly min = input<number>(1);
  readonly max = input<number | null>(null);
  readonly step = input<number>(1);
  readonly unit = input<string | null>(null);
  readonly disabled = input<boolean>(false);
  readonly ariaLabel = input<string>('Quantity');

  readonly isAtMin = computed(() => {
    const v = this.value();
    if (v === null || v === undefined) return false;
    return v <= this.min();
  });
  readonly isAtMax = computed(() => {
    const maxVal = this.max();
    const v = this.value();
    if (v === null || v === undefined) return false;
    return maxVal !== null && maxVal !== undefined && v >= maxVal;
  });

  decrement(): void {
    if (this.disabled() || this.isAtMin()) return;
    const current = isNaN(Number(this.value())) ? this.min() : Number(this.value());
    const next = Math.max(this.min(), current - this.step());
    this.value.set(next);
  }

  increment(): void {
    if (this.disabled() || this.isAtMax()) return;
    const current = isNaN(Number(this.value())) ? this.min() : Number(this.value());
    let next = current + this.step();
    const maxVal = this.max();
    if (maxVal !== null && maxVal !== undefined) {
      next = Math.min(maxVal, next);
    }
    this.value.set(next);
  }

  onInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    let parsed = parseFloat(target.value);
    if (isNaN(parsed)) {
      parsed = this.min();
    }
    parsed = Math.max(this.min(), parsed);
    const maxVal = this.max();
    if (maxVal !== null && maxVal !== undefined) {
      parsed = Math.min(maxVal, parsed);
    }
    this.value.set(parsed);
    target.value = String(parsed);
  }
}
