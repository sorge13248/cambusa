import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { formatLocalDate } from '../../pipes/local-date.pipe.js';

export type QuickDateAction = 'today' | 'tomorrow' | '+2d' | '-2d' | '+5d' | '+7d';

@Component({
  selector: 'app-quick-date-modifier',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quick-date-modifier.component.html',
  styleUrl: './quick-date-modifier.component.scss',
})
export class QuickDateModifierComponent {
  readonly currentDate = input<string | null>(null);
  readonly label = input<string>('Best Before:');
  readonly compact = input<boolean>(false);
  readonly showDateDisplay = input<boolean>(true);
  readonly bare = input<boolean>(false);

  readonly dateChange = output<string>();

  formattedCurrentDate(): string {
    const raw = this.currentDate();
    if (!raw) return 'No date set';
    return formatLocalDate(raw) || raw;
  }

  adjust(action: QuickDateAction) {
    const today = new Date();
    let baseDate = new Date();

    if (this.currentDate() && !['today', 'tomorrow'].includes(action)) {
      const parsed = new Date(this.currentDate()!);
      if (!isNaN(parsed.getTime())) {
        baseDate = parsed;
      }
    }

    let targetDate = new Date(baseDate);

    switch (action) {
      case 'today':
        targetDate = new Date(today);
        break;
      case 'tomorrow':
        targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + 1);
        break;
      case '+2d':
        targetDate.setDate(targetDate.getDate() + 2);
        break;
      case '-2d':
        targetDate.setDate(targetDate.getDate() - 2);
        break;
      case '+5d':
        targetDate.setDate(targetDate.getDate() + 5);
        break;
      case '+7d':
        targetDate.setDate(targetDate.getDate() + 7);
        break;
    }

    const isoDate = this.formatDate(targetDate);
    this.dateChange.emit(isoDate);
  }

  private formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
