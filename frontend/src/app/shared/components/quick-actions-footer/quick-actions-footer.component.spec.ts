import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { QuickActionsFooterComponent } from './quick-actions-footer.component.js';
import { PantryQuickConsumeModalComponent } from '../../../features/pantry/pantry-quick-consume-modal/pantry-quick-consume-modal.component.js';
import { PantryAddItemModalComponent } from '../../../features/pantry/pantry-add-item-modal/pantry-add-item-modal.component.js';

describe('QuickActionsFooterComponent', () => {
  let component: QuickActionsFooterComponent;
  let fixture: ComponentFixture<QuickActionsFooterComponent>;
  const mockDialog = {
    open: vi.fn().mockReturnValue({
      closed: of({}),
    }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickActionsFooterComponent],
      providers: [
        { provide: Dialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuickActionsFooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should open PantryQuickConsumeModalComponent on openQuickConsume', () => {
    component.openQuickConsume();
    expect(mockDialog.open).toHaveBeenCalledWith(PantryQuickConsumeModalComponent, {
      disableClose: true,
    });
  });

  it('should open PantryAddItemModalComponent on openQuickPurchase', () => {
    component.openQuickPurchase();
    expect(mockDialog.open).toHaveBeenCalledWith(PantryAddItemModalComponent, {
      disableClose: true,
      data: {
        quickPurchaseMode: true,
        startWithScanner: true,
      },
    });
  });
});
