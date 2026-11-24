import { CommonModule } from '@angular/common';
import { Component, input, model, output } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  LucideBell,
  LucideGlobe,
  LucideKey,
  LucidePackage,
  LucideShoppingCart,
  LucideStore,
  LucideUser,
  LucideUtensils,
  LucideZap,
} from '@lucide/angular';

export interface TabItem<T = string> {
  id: T;
  label: string;
  icon?: string;
  lucideIcon?: 'user' | 'zap' | 'utensils' | 'bell' | 'key' | 'globe' | 'store' | 'shopping-cart' | 'package' | string;
  badge?: string | number | null;
  badgeVariant?: 'neutral' | 'success' | 'warning' | 'danger';
  disabled?: boolean;
}

export type TabViewVariant = 'default' | 'subtle' | 'pill';

@Component({
  selector: 'app-tabview',
  standalone: true,
  imports: [
    CommonModule,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    LucideBell,
    LucideGlobe,
    LucideKey,
    LucidePackage,
    LucideShoppingCart,
    LucideStore,
    LucideUser,
    LucideUtensils,
    LucideZap,
  ],
  templateUrl: './tab-view.component.html',
  styleUrl: './tab-view.component.scss',
})
export class TabViewComponent<T = string> {
  readonly tabs = input.required<TabItem<T>[]>();
  readonly activeTabId = model<T | null>(null);
  readonly ariaLabel = input<string>('Navigation Tabs');
  readonly variant = input<TabViewVariant>('default');
  readonly reorderable = input<boolean>(false);
  readonly wrap = input<boolean>(false);

  readonly tabChange = output<T>();
  readonly reordered = output<TabItem<T>[]>();

  selectTab(id: T): void {
    if (this.activeTabId() !== id) {
      this.activeTabId.set(id);
      this.tabChange.emit(id);
    }
  }

  onDrop(event: CdkDragDrop<TabItem<T>[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const list = [...this.tabs()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.reordered.emit(list);
  }
}
