import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom, Subscription } from 'rxjs';
import { LucideCamera, LucideSearch, LucideUtensils, LucideX } from '@lucide/angular';
import { ApiService } from '../../../core/api.service.js';
import { UndoService } from '../../../core/undo.service.js';
import { Product, StockItem } from '../../../core/models.js';
import { AutocompleteDirective, AutocompleteOption } from '../../../shared/directives/autocomplete.directive.js';
import { BarcodeScannerComponent } from '../../../shared/components/barcode-scanner/barcode-scanner.component.js';
import { QuickConsumeConfirmModalComponent } from '../quick-consume-confirm-modal/quick-consume-confirm-modal.component.js';

@Component({
  selector: 'app-pantry-quick-consume-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AutocompleteDirective,
    BarcodeScannerComponent,
    LucideCamera,
    LucideSearch,
    LucideUtensils,
    LucideX,
  ],
  templateUrl: './pantry-quick-consume-modal.component.html',
  styleUrl: './pantry-quick-consume-modal.component.scss',
})
export class PantryQuickConsumeModalComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly api = inject(ApiService);
  private readonly undoService = inject(UndoService);
  private subs = new Subscription();

  @ViewChild('productInput') productInputElement?: ElementRef<HTMLInputElement>;

  readonly products = signal<Product[]>([]);
  readonly searchInputText = signal<string>('');
  readonly isScannerOpen = signal<boolean>(true); // Active by default
  readonly selectedProductId = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly isProcessing = signal<boolean>(false);
  readonly timerSeconds = signal<number>(10);

  readonly productOptions = computed<AutocompleteOption[]>(() => {
    return this.products()
      .filter((p) => p.active !== false)
      .map((p) => ({
        id: p.id,
        label: p.name,
        subLabel: p.hierarchyPath || (p.barcodes && p.barcodes.length > 0 ? p.barcodes.join(', ') : undefined),
      }));
  });

  async ngOnInit(): Promise<void> {
    this.subs.add(
      this.dialogRef.backdropClick.subscribe(() => {
        this.close();
      }),
    );

    this.subs.add(
      this.dialogRef.keydownEvents.subscribe((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      }),
    );

    try {
      const [prods, profile] = await Promise.all([
        this.api.getProducts(),
        this.api.getProfile().catch(() => null),
      ]);
      this.products.set(prods);
      if (profile?.settings?.quickConsumeTimerSeconds) {
        this.timerSeconds.set(profile.settings.quickConsumeTimerSeconds);
      }
    } catch {
      // fallback
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  toggleScanner(): void {
    this.isScannerOpen.set(!this.isScannerOpen());
  }

  async onBarcodeScanned(code: string): Promise<void> {
    const val = code.trim();
    if (!val) return;

    this.isScannerOpen.set(false);
    this.errorMessage.set(null);

    const match = this.products().find((p) =>
      p.barcodes?.some((bc) => bc.toLowerCase() === val.toLowerCase()),
    );

    if (match) {
      await this.processProduct(match);
    } else {
      this.errorMessage.set(`No product found with barcode "${val}"`);
      this.searchInputText.set(val);
    }
  }

  async onProductSelected(id: string | null): Promise<void> {
    this.selectedProductId.set(id);
    this.errorMessage.set(null);
    if (!id) return;

    const product = this.products().find((p) => p.id === id);
    if (product) {
      await this.processProduct(product);
    }
  }

  async processProduct(product: Product): Promise<void> {
    this.isProcessing.set(true);
    this.errorMessage.set(null);

    try {
      const stock = await this.api.getStock();
      const availableBatches = (stock || []).filter((s) => s.productId === product.id && s.amount > 0);

      if (availableBatches.length === 0) {
        this.errorMessage.set(`No stock available in pantry for "${product.name}"`);
        this.resetFields(true);
        return;
      }

      // Find earliest expiring batch
      const sortedBatches = [...availableBatches].sort((a, b) => {
        if (!a.bestBeforeDate) return 1;
        if (!b.bestBeforeDate) return -1;
        return new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime();
      });

      const targetBatch = sortedBatches[0];

      // Open confirm modal with auto-approve countdown
      const confirmRef = this.dialog.open<boolean>(QuickConsumeConfirmModalComponent, {
        disableClose: true,
        data: {
          product,
          stockItem: targetBatch,
          timerSeconds: this.timerSeconds(),
        },
      });

      const confirmed = await firstValueFrom(confirmRef.closed);
      if (confirmed) {
        const openRes = await this.api.openStock(targetBatch.id, 1);

        this.undoService.register({
          description: `Opened 1x ${product.name}`,
          undo: async () => {
            await this.api.revertOpen({
              openedStockItemId: openRes.openedStockItem.id,
              originalStockItemId: openRes.originalStockItem?.id,
              split: openRes.split,
              amount: 1,
              originalDate: openRes.originalDate,
              originalLocationId: openRes.originalLocationId,
            });
          },
        });

        this.errorMessage.set(null);
      }
    } catch (err: any) {
      this.errorMessage.set(`Failed to open stock: ${err?.message || err}`);
    } finally {
      this.isProcessing.set(false);
      this.resetFields(true); // reset fields and re-open scanner for next item
    }
  }

  resetFields(reopenScanner: boolean): void {
    this.selectedProductId.set(null);
    this.searchInputText.set('');
    if (this.productInputElement) {
      this.productInputElement.nativeElement.value = '';
    }
    if (reopenScanner) {
      this.isScannerOpen.set(true);
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
