import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { PantryQuickConsumeModalComponent } from './pantry-quick-consume-modal.component.js';
import { ApiService } from '../../../core/api.service.js';
import { UndoService } from '../../../core/undo.service.js';

describe('PantryQuickConsumeModalComponent', () => {
  let component: PantryQuickConsumeModalComponent;
  let fixture: ComponentFixture<PantryQuickConsumeModalComponent>;
  const mockDialogRef = {
    close: vi.fn(),
    backdropClick: of(),
    keydownEvents: of(),
  };

  const mockApiService = {
    getProducts: vi.fn().mockResolvedValue([
      { id: 'p1', name: 'Coffee', barcodes: ['123456'], active: true },
    ]),
    getProfile: vi.fn().mockResolvedValue({
      settings: { quickConsumeTimerSeconds: 10 },
    }),
    getStock: vi.fn().mockResolvedValue([
      { id: 's1', productId: 'p1', amount: 2, bestBeforeDate: '2026-10-01' },
    ]),
    openStock: vi.fn().mockResolvedValue({}),
    revertOpen: vi.fn().mockResolvedValue({}),
  };

  const mockUndoService = {
    register: vi.fn(),
  };

  const mockDialog = {
    open: vi.fn().mockReturnValue({
      closed: of(true),
    }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PantryQuickConsumeModalComponent],
      providers: [
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
        { provide: UndoService, useValue: mockUndoService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PantryQuickConsumeModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with barcode scanner active by default', () => {
    expect(component.isScannerOpen()).toBe(true);
  });

  it('should toggle scanner', () => {
    component.toggleScanner();
    expect(component.isScannerOpen()).toBe(false);
  });

  it('should process barcode and open stock on confirmation', async () => {
    await component.onBarcodeScanned('123456');
    expect(mockApiService.getStock).toHaveBeenCalled();
    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockApiService.openStock).toHaveBeenCalledWith('s1', 1);
    expect(mockUndoService.register).toHaveBeenCalled();
  });
});
