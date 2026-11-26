import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, model, OnDestroy } from '@angular/core';
import {
  LucideChevronDown,
  LucideClipboardList,
  LucideClock,
  LucideCookingPot,
  LucideImage,
  LucideMapPin,
  LucideScale,
  LucideSlidersHorizontal,
  LucideStore,
  LucideTag,
  LucideUsers,
} from '@lucide/angular';
import { BackNavigationService, CollapsibleToggleable } from '../../../core/back-navigation.service.js';

@Component({
  selector: 'app-collapsible-section',
  standalone: true,
  imports: [
    CommonModule,
    LucideChevronDown,
    LucideClipboardList,
    LucideClock,
    LucideCookingPot,
    LucideImage,
    LucideMapPin,
    LucideScale,
    LucideSlidersHorizontal,
    LucideStore,
    LucideTag,
    LucideUsers,
  ],
  templateUrl: './collapsible-section.component.html',
  styleUrl: './collapsible-section.component.scss',
})
export class CollapsibleSectionComponent implements CollapsibleToggleable, OnDestroy {
  private readonly backNav = inject(BackNavigationService);

  readonly title = input.required<string>();
  readonly icon = input<string>('📋');
  readonly lucideIcon = input<string | null>(null);
  readonly badge = input<string | number | null>(null);
  readonly badgeVariant = input<'default' | 'warning' | 'info'>('default');
  readonly isOpen = model<boolean>(false);
  readonly expanded = model<boolean>(false);

  constructor() {
    effect(() => {
      const isExpanded = this.isSectionExpanded();
      if (isExpanded) {
        this.backNav.registerCollapsibleOpen(this);
      } else {
        this.backNav.registerCollapsibleClosed(this);
      }
    });
  }

  ngOnDestroy(): void {
    this.backNav.unregisterOnDestroy(this);
  }

  isSectionExpanded(): boolean {
    return this.isOpen() || this.expanded();
  }

  close(): void {
    this.isOpen.set(false);
    this.expanded.set(false);
  }

  toggle() {
    const next = !this.isSectionExpanded();
    this.isOpen.set(next);
    this.expanded.set(next);
  }
}
