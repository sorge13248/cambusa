import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CdkDatepickerComponent } from './cdk-datepicker.component.js';

describe('CdkDatepickerComponent', () => {
  let component: CdkDatepickerComponent;
  let fixture: ComponentFixture<CdkDatepickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CdkDatepickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CdkDatepickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with date', () => {
    component.date = '2026-12-01';
    expect(component.currentDate()).toBe('2026-12-01');
    expect(component.neverExpires()).toBe(false);
  });

  it('should handle never expires toggle', () => {
    component.date = '2026-12-01';
    component.toggleNeverExpires({ target: { checked: true } } as unknown as Event);
    expect(component.neverExpires()).toBe(true);
    expect(component.currentDate()).toBeNull();
  });

  it('should set preset days', () => {
    let emitted: string | null = null;
    component.dateChange.subscribe((val) => (emitted = val));
    component.setPresetDays(0);
    expect(component.neverExpires()).toBe(false);
    expect(emitted).toBeTruthy();
  });
});
