import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BarcodeScannerComponent } from './barcode-scanner.component';

describe('BarcodeScannerComponent', () => {
  let component: BarcodeScannerComponent;
  let fixture: ComponentFixture<BarcodeScannerComponent>;

  let mockTrack: any;
  let mockStream: any;
  let mockGetUserMedia: any;
  let mockEnumerateDevices: any;

  beforeEach(async () => {
    mockTrack = {
      stop: vi.fn(),
      getCapabilities: vi.fn().mockReturnValue({ torch: true }),
      applyConstraints: vi.fn().mockResolvedValue(undefined),
    };

    mockStream = {
      getTracks: vi.fn().mockReturnValue([mockTrack]),
      getVideoTracks: vi.fn().mockReturnValue([mockTrack]),
    };

    mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
    mockEnumerateDevices = vi.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'back-camera' },
      { kind: 'videoinput', deviceId: 'front-camera' },
    ]);

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
        enumerateDevices: mockEnumerateDevices,
      },
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [BarcodeScannerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BarcodeScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the barcode scanner component', () => {
    expect(component).toBeTruthy();
  });

  it('should request camera stream on startCamera', async () => {
    await component.startCamera();

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    expect(component.isStreaming()).toBe(true);
    expect(component.isFlashAvailable()).toBe(true);
  });

  it('should stop active media tracks on stopCamera', async () => {
    await component.startCamera();
    expect(component.isStreaming()).toBe(true);

    component.stopCamera();

    expect(mockTrack.stop).toHaveBeenCalled();
    expect(component.isStreaming()).toBe(false);
  });

  it('should switch camera between rear and front', async () => {
    expect(component.camera()).toBe('rear');
    const cameraSpy = vi.fn();
    component.camera.subscribe(cameraSpy);

    await component.switchCamera();

    expect(component.camera()).toBe('front');
    expect(cameraSpy).toHaveBeenCalledWith('front');
    expect(mockGetUserMedia).toHaveBeenLastCalledWith({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    await component.switchCamera();
    expect(component.camera()).toBe('rear');
    expect(cameraSpy).toHaveBeenCalledWith('rear');
  });

  it('should toggle flash when torch is available', async () => {
    await component.startCamera();
    expect(component.isFlashAvailable()).toBe(true);
    expect(component.flash()).toBe(false);

    const flashSpy = vi.fn();
    component.flash.subscribe(flashSpy);

    await component.toggleFlash();

    expect(mockTrack.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: true }],
    });
    expect(component.flash()).toBe(true);
    expect(flashSpy).toHaveBeenCalledWith(true);

    await component.toggleFlash();
    expect(mockTrack.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: false }],
    });
    expect(component.flash()).toBe(false);
    expect(flashSpy).toHaveBeenCalledWith(false);
  });

  it('should handle camera permission denial gracefully', async () => {
    const errorSpy = vi.fn();
    component.error.subscribe(errorSpy);

    mockGetUserMedia.mockRejectedValueOnce({ name: 'NotAllowedError' });

    await component.startCamera();

    expect(component.isStreaming()).toBe(false);
    expect(component.errorMessage()).toContain('Camera permission denied');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Camera permission denied'));
  });

  it('should emit scanned code and trigger feedback', () => {
    const scannedSpy = vi.fn();
    component.scanned.subscribe(scannedSpy);

    // Call internal handleScannedValue
    (component as any).handleScannedValue('8001234567890');

    expect(scannedSpy).toHaveBeenCalledWith('8001234567890');
    expect(component.lastScannedCode()).toBe('8001234567890');
  });

  it('should emit close event on onClose', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.onClose();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('should hide switch camera button when only one camera is present (e.g. laptop)', async () => {
    mockEnumerateDevices.mockResolvedValueOnce([{ kind: 'videoinput', deviceId: 'laptop-webcam' }]);
    mockTrack.getCapabilities.mockReturnValueOnce({}); // No multiple facingModes

    await component.startCamera();
    fixture.detectChanges();

    expect(component.hasMultipleCameras()).toBe(false);
    const switchBtn = fixture.nativeElement.querySelector('.btn-tool[aria-label="Switch camera"]');
    expect(switchBtn).toBeNull();
  });

  it('should hide flash button when torch is not supported by device/camera', async () => {
    mockTrack.getCapabilities.mockReturnValueOnce({ torch: false });

    await component.startCamera();
    fixture.detectChanges();

    expect(component.isFlashAvailable()).toBe(false);
    const flashBtn = fixture.nativeElement.querySelector('.btn-tool[aria-label="Toggle flash"]');
    expect(flashBtn).toBeNull();
  });

  it('should support upside-down (180 deg) and sideways (90 deg and 270 deg) canvas rotation for rotated barcodes', () => {
    const mockVideo = {
      videoWidth: 640,
      videoHeight: 480,
    } as HTMLVideoElement;

    const mockCtx = {
      save: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
    };

    const spyCreateElement = vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
    } as any);

    const canvas180 = (component as any).getRotatedCanvas(mockVideo, 180);
    expect(canvas180).toBeTruthy();
    expect(mockCtx.translate).toHaveBeenCalledWith(640, 480);
    expect(mockCtx.rotate).toHaveBeenCalledWith(Math.PI);
    expect(mockCtx.drawImage).toHaveBeenCalled();

    const canvas90 = (component as any).getRotatedCanvas(mockVideo, 90);
    expect(canvas90).toBeTruthy();
    expect(mockCtx.translate).toHaveBeenCalledWith(480, 0);
    expect(mockCtx.rotate).toHaveBeenCalledWith(Math.PI / 2);

    const canvas270 = (component as any).getRotatedCanvas(mockVideo, 270);
    expect(canvas270).toBeTruthy();
    expect(mockCtx.translate).toHaveBeenCalledWith(0, 640);
    expect(mockCtx.rotate).toHaveBeenCalledWith((3 * Math.PI) / 2);

    spyCreateElement.mockRestore();
  });
});
