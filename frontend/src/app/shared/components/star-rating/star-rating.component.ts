import { CommonModule } from '@angular/common';
import { Component, computed, input, model, signal } from '@angular/core';
import { LucideStar, LucideX } from '@lucide/angular';

@Component({
  selector: 'app-star-rating',
  standalone: true,
  imports: [CommonModule, LucideStar, LucideX],
  templateUrl: './star-rating.component.html',
  styleUrl: './star-rating.component.scss',
})
export class StarRatingComponent {
  readonly value = model<number | null>(null);
  readonly readonly = input<boolean>(false);
  readonly size = input<number>(18);
  readonly showClear = input<boolean>(true);
  readonly ariaLabel = input<string>('Product rating');

  readonly hoveredStar = signal<number | null>(null);
  readonly stars = [1, 2, 3, 4, 5] as const;

  readonly displayValue = computed(() => {
    if (!this.readonly() && this.hoveredStar() !== null) {
      return this.hoveredStar()!;
    }
    return this.value() ?? 0;
  });

  selectStar(star: number): void {
    if (this.readonly()) return;
    // Clicking an already-assigned star keeps it selected; only Clear resets to null.
    this.value.set(star);
  }

  onMouseEnter(star: number): void {
    if (this.readonly()) return;
    this.hoveredStar.set(star);
  }

  onMouseLeave(): void {
    if (this.readonly()) return;
    this.hoveredStar.set(null);
  }

  clearRating(): void {
    if (this.readonly()) return;
    this.value.set(null);
    this.hoveredStar.set(null);
  }
}
