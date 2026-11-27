import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { CdkDrag, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import {
  LucideAlertTriangle,
  LucideCheckCircle2,
  LucideClock,
  LucideMapPin,
  LucidePackage,
  LucideSparkles,
} from '@lucide/angular';
import { NextItemDto } from '../../../core/models.js';

export interface AlertDragItem {
  kind: 'alert';
  item: NextItemDto;
}

@Component({
  selector: 'app-expiration-alerts',
  standalone: true,
  imports: [
    CommonModule,
    CdkDrag,
    CdkDragPlaceholder,
    CdkDropList,
    LucideAlertTriangle,
    LucideCheckCircle2,
    LucideClock,
    LucideMapPin,
    LucidePackage,
    LucideSparkles,
  ],
  templateUrl: './expiration-alerts.component.html',
  styleUrl: './expiration-alerts.component.scss',
})
export class ExpirationAlertsComponent {
  readonly expired = input.required<NextItemDto[]>();
  readonly expiringSoon = input.required<NextItemDto[]>();
  readonly configuredDays = input<number>(5);
  readonly layout = input<'grid' | 'stacked'>('grid');
  readonly draggable = input<boolean>(false);

  readonly itemSelected = output<NextItemDto>();

  readonly neverEnterPredicate = (): boolean => false;
  private isDragging = false;
  private lastDragEndTime = 0;

  toDragData(item: NextItemDto): AlertDragItem {
    return { kind: 'alert', item };
  }

  onDragStarted(): void {
    this.isDragging = true;
  }

  onDragEnded(): void {
    this.isDragging = false;
    this.lastDragEndTime = Date.now();
  }

  onSelectItem(item: NextItemDto): void {
    if (this.isDragging || Date.now() - this.lastDragEndTime < 200) {
      return;
    }
    this.itemSelected.emit(item);
  }
}
