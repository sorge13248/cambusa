import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { QuickConsumeConfirmModalComponent, QuickConsumeConfirmData } from './quick-consume-confirm-modal.component.js';

describe('QuickConsumeConfirmModalComponent', () => {
  let component: QuickConsumeConfirmModalComponent;
  let fixture: ComponentFixture<QuickConsumeConfirmModalComponent>;
  const mockDialogRef = {
    close: vi.fn(),
  };

  const mockData: QuickConsumeConfirmData = {
    product: { id: 'p1', name: 'Milk', active: true } as any,
    stockItem: { id: 's1', productId: 'p1', amount: 1, bestBeforeDate: '2026-12-01', locationName: 'Fridge' } as any,
    timerSeconds: 10,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickConsumeConfirmModalComponent],
      providers: [
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuickConsumeConfirmModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with provided timerSeconds', () => {
    expect(component.remainingSeconds()).toBe(10);
    expect(component.progressPercent()).toBe(100);
  });

  it('should close with consume on confirm', () => {
    component.confirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith('consume');
  });

  it('should close with open on markAsOpen immediately without waiting for timer', () => {
    component.markAsOpen();
    expect(mockDialogRef.close).toHaveBeenCalledWith('open');
  });

  it('should close with cancel on cancel', () => {
    component.cancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith('cancel');
  });

  it('should auto-confirm and close with consume when countdown reaches zero', () => {
    vi.useFakeTimers();
    const mockRef = { close: vi.fn() };
    const customFixture = TestBed.createComponent(QuickConsumeConfirmModalComponent);
    const customComponent = customFixture.componentInstance;
    (customComponent as any).dialogRef = mockRef;
    (customComponent as any).totalSeconds = 2;

    customComponent.ngOnInit();
    expect(mockRef.close).not.toHaveBeenCalled();

    // Advance timer past totalSeconds
    vi.advanceTimersByTime(2100);
    expect(mockRef.close).toHaveBeenCalledWith('consume');
    customComponent.ngOnDestroy();
    vi.useRealTimers();
  });
});
