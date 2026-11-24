import { CommonModule } from '@angular/common';
import { Component, inject, output } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { LucideShoppingCart, LucideUtensils } from '@lucide/angular';
import { PantryAddItemModalComponent } from '../../../features/pantry/pantry-add-item-modal/pantry-add-item-modal.component.js';
import { PantryQuickConsumeModalComponent } from '../../../features/pantry/pantry-quick-consume-modal/pantry-quick-consume-modal.component.js';

@Component({
  selector: 'app-quick-actions-footer',
  standalone: true,
  imports: [CommonModule, LucideUtensils, LucideShoppingCart],
  templateUrl: './quick-actions-footer.component.html',
  styleUrl: './quick-actions-footer.component.scss',
})
export class QuickActionsFooterComponent {
  private readonly dialog = inject(Dialog);

  readonly stockChanged = output<void>();

  openQuickConsume(): void {
    const ref = this.dialog.open(PantryQuickConsumeModalComponent, {
      disableClose: true,
    });

    ref.closed.subscribe(() => {
      this.stockChanged.emit();
    });
  }

  openQuickPurchase(): void {
    const ref = this.dialog.open(PantryAddItemModalComponent, {
      disableClose: true,
      data: {
        quickPurchaseMode: true,
        startWithScanner: true,
      },
    });

    ref.closed.subscribe(() => {
      this.stockChanged.emit();
    });
  }
}
