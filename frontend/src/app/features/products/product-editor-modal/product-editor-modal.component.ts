import { Component, inject, OnDestroy, OnInit, viewChild } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { Product } from '../../../core/models.js';
import {
  PhotoItem,
  ProductDetailViewComponent,
  ProductEditorModalData,
} from '../product-detail-view/product-detail-view.component.js';

export type { PhotoItem, ProductEditorModalData };

@Component({
  selector: 'app-product-editor-modal',
  standalone: true,
  imports: [ProductDetailViewComponent],
  templateUrl: './product-editor-modal.component.html',
  styleUrl: './product-editor-modal.component.scss',
})
export class ProductEditorModalComponent implements OnInit, OnDestroy {
  readonly data = inject<ProductEditorModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  readonly detailView = viewChild(ProductDetailViewComponent);

  private subs = new Subscription();

  ngOnInit(): void {
    this.subs.add(
      this.dialogRef.backdropClick.subscribe(() => {
        this.detailView()?.cancel();
      }),
    );

    this.subs.add(
      this.dialogRef.keydownEvents.subscribe((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.detailView()?.cancel();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onSaved(result: { product: Product; isNew: boolean }): void {
    this.dialogRef.close(result);
  }

  onCancelled(): void {
    this.dialogRef.close(false);
  }
}
