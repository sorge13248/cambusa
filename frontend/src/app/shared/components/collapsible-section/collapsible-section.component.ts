import { CommonModule } from '@angular/common';
import { Component, input, model } from '@angular/core';

@Component({
  selector: 'app-collapsible-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './collapsible-section.component.html',
  styleUrl: './collapsible-section.component.scss',
})
export class CollapsibleSectionComponent {
  readonly title = input.required<string>();
  readonly icon = input<string>('📋');
  readonly badge = input<string | number | null>(null);
  readonly badgeVariant = input<'default' | 'warning' | 'info'>('default');
  readonly isOpen = model<boolean>(false);
  readonly expanded = model<boolean>(false);

  isSectionExpanded(): boolean {
    return this.isOpen() || this.expanded();
  }

  toggle() {
    const next = !this.isSectionExpanded();
    this.isOpen.set(next);
    this.expanded.set(next);
  }
}
