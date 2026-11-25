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
      { id: 's1', productId: 'p1', amount: 2, bestBeforeDate: '2026-10-01', locationId: 'l1' },
    ]),
    consumeStock: vi.fn().mockResolvedValue({ consumed: true }),
    addStock: vi.fn().mockResolvedValue({}),
    openStock: vi.fn().mockResolvedValue({
      openedStockItem: { id: 's1-opened', isOpen: true },
      originalStockItem: { id: 's1', amount: 1 },
      split: true,
      originalDate: '2026-10-01',
      originalLocationId: 'l1',
    }),
    revertOpen: vi.fn().mockResolvedValue({}),
  };

  const mockUndoService = {
    register: vi.fn(),
  };

  const mockDialog = {
    open: vi.fn().mockReturnValue({
      closed: of('consume'),
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

  it('should process barcode and consume stock on confirmation', async () => {
    mockDialog.open.mockReturnValueOnce({ closed: of('consume') });
    await component.onBarcodeScanned('123456');
    expect(mockApiService.getStock).toHaveBeenCalled();
    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockApiService.consumeStock).toHaveBeenCalledWith('s1', 1);
    expect(mockUndoService.register).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Consumed 1x Coffee',
      }),
    );
  });

  it('should mark stock as open when markAsOpen action is selected', async () => {
    mockDialog.open.mockReturnValueOnce({ closed: of('open') });
    await component.onBarcodeScanned('123456');
    expect(mockApiService.getStock).toHaveBeenCalled();
    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockApiService.openStock).toHaveBeenCalledWith('s1', 1);
    expect(mockUndoService.register).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Opened 1x Coffee',
      }),
    );
  });

  it('should ignore concurrent barcode scans and product selections while processing or confirm modal is active', async () => {
    // Return a dialog whose closed observable does not resolve immediately
    let closeSubject: (val: string) => void = () => {};
    const pendingClosedPromise = new Promise<string>((resolve) => {
      closeSubject = resolve;
    });

    mockDialog.open.mockReturnValueOnce({
      closed: {
        subscribe: (obs: any) => {
          pendingClosedPromise.then((v) => {
            if (typeof obs === 'function') obs(v);
            else if (obs?.next) obs.next(v);
          });
          return { unsubscribe: () => {} };
        },
      },
    });

    // Start processing first scan
    const firstScanPromise = component.onBarcodeScanned('123456');

    // Attempt concurrent scan with same or another barcode while active
    await component.onBarcodeScanned('123456');
    await component.onProductSelected('p1');

    expect(mockDialog.open).toHaveBeenCalledTimes(1);

    // Resolve first dialog
    closeSubject('consume');
    await firstScanPromise;
  });
});
