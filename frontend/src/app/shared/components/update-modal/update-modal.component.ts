import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogRef } from '@angular/cdk/dialog';

@Component({
  selector: 'app-update-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './update-modal.component.html',
  styleUrl: './update-modal.component.scss',
})
export class UpdateModalComponent {
  private readonly dialogRef = inject(DialogRef<boolean>);

  dismiss(): void {
    this.dialogRef.close(false);
  }

  reload(): void {
    this.dialogRef.close(true);
  }
}
