import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ConfirmModalComponent, ConfirmModalData } from './confirm-modal.component.js';

describe('ConfirmModalComponent', () => {
  let component: ConfirmModalComponent;
  let fixture: ComponentFixture<ConfirmModalComponent>;
  let mockDialogRef: Partial<DialogRef<boolean>>;

  const mockData: ConfirmModalData = {
    title: 'Confirm Delete',
    message: 'Are you sure?',
    confirmLabel: 'Delete',
    confirmVariant: 'danger',
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ConfirmModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render title and message', () => {
    expect(component).toBeTruthy();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.modal-title')?.textContent).toContain('Confirm Delete');
    expect(el.querySelector('.modal-message')?.textContent).toContain('Are you sure?');
  });

  it('should close with true on confirm', () => {
    component.confirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });

  it('should close with false on cancel', () => {
    component.close();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });
});
