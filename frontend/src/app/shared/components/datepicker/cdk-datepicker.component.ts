import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-cdk-datepicker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cdk-datepicker.component.html',
  styleUrl: './cdk-datepicker.component.scss',
})
export class CdkDatepickerComponent implements OnInit {
  @Input() set date(val: string | null) {
    this.currentDate.set(val);
    this.neverExpires.set(val === null || val === '');
  }

  @Output() dateChange = new EventEmitter<string | null>();

  readonly currentDate = signal<string | null>(null);
  readonly neverExpires = signal<boolean>(false);

  private savedDate: string | null = null;

  ngOnInit(): void {
    if (this.currentDate()) {
      this.savedDate = this.currentDate();
    }
  }

  onDateChange(newVal: string): void {
    this.currentDate.set(newVal || null);
    this.savedDate = newVal || null;
    this.dateChange.emit(newVal || null);
  }

  toggleNeverExpires(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.neverExpires.set(isChecked);

    if (isChecked) {
      if (this.currentDate()) {
        this.savedDate = this.currentDate();
      }
      this.currentDate.set(null);
      this.dateChange.emit(null);
    } else {
      const restored = this.savedDate || this.formatDate(new Date());
      this.currentDate.set(restored);
      this.dateChange.emit(restored);
    }
  }

  setPresetDays(days: number): void {
    const target = new Date();
    target.setDate(target.getDate() + days);
    const dateStr = this.formatDate(target);
    this.currentDate.set(dateStr);
    this.savedDate = dateStr;
    this.neverExpires.set(false);
    this.dateChange.emit(dateStr);
  }

  private formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
