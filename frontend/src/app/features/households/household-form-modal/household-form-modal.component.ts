import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom, Subscription } from 'rxjs';
import { LucideX } from '@lucide/angular';
import { ApiService } from '../../../core/api.service.js';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component.js';

export interface HouseholdFormModalData {
  householdId?: string;
  currentName?: string;
}

@Component({
  selector: 'app-household-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideX],
  templateUrl: './household-form-modal.component.html',
  styleUrl: './household-form-modal.component.scss',
})
export class HouseholdFormModalComponent implements OnInit, OnDestroy {
  readonly data = inject<HouseholdFormModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly api = inject(ApiService);

  name = '';
  readonly isSaving = signal<boolean>(false);
  private initialName = '';
  private subs = new Subscription();

  ngOnInit() {
    if (this.data.currentName) {
      this.name = this.data.currentName;
    }
    this.initialName = this.name.trim();

    this.subs.add(
      this.dialogRef.backdropClick.subscribe(() => {
        this.requestClose();
      }),
    );

    this.subs.add(
      this.dialogRef.keydownEvents.subscribe((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.requestClose();
        }
      }),
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  isDirty(): boolean {
    return this.name.trim() !== this.initialName;
  }

  async save() {
    if (!this.name.trim()) return;

    this.isSaving.set(true);
    try {
      if (this.data.householdId) {
        const updated = await this.api.updateHousehold(this.data.householdId, this.name.trim());
        this.dialogRef.close(updated);
      } else {
        const created = await this.api.createHousehold(this.name.trim());
        this.dialogRef.close(created);
      }
    } catch (err) {
      console.error('Failed to save household:', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  async requestClose() {
    if (this.isDirty()) {
      const confirmRef = this.dialog.open(ConfirmModalComponent, {
        data: {
          title: 'Unsaved Changes',
          message: 'You have unsaved changes in this household form. Are you sure you want to discard them?',
          confirmLabel: 'Discard Changes',
          confirmVariant: 'danger',
        },
      });
      const confirmed = await firstValueFrom(confirmRef.closed);
      if (!confirmed) return;
    }
    this.dialogRef.close(null);
  }

  close(result: any) {
    if (result) {
      this.dialogRef.close(result);
    } else {
      this.requestClose();
    }
  }
}
