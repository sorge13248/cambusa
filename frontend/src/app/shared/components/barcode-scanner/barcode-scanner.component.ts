import { CommonModule } from '@angular/common';
import { LucideAlertTriangle, LucideCheck, LucideRotateCw, LucideX, LucideZap } from '@lucide/angular';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export type CameraFacing = 'rear' | 'front';

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule, LucideAlertTriangle, LucideCheck, LucideRotateCw, LucideX, LucideZap],
  templateUrl: './barcode-scanner.component.html',
  styleUrl: './barcode-scanner.component.scss',
})
export class BarcodeScannerComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('videoElement') readonly videoElement!: ElementRef<HTMLVideoElement>;

  // Inputs / Two-way models
  readonly active = input<boolean>(true);
  readonly camera = model<CameraFacing>('rear');
  readonly flash = model<boolean>(false);
  readonly continuous = input<boolean>(false);
  readonly cooldownMs = input<number>(1500);
  readonly beepOnScan = input<boolean>(true);
  readonly vibrateOnScan = input<boolean>(true);
  readonly showControls = input<boolean>(true);
  readonly hint = input<string>('Align barcode or QR code inside the frame');

  // Outputs
  readonly scanned = output<string>();
  readonly error = output<string>();
  readonly close = output<void>();

  // State signals
  readonly isStreaming = signal<boolean>(false);
  readonly isFlashAvailable = signal<boolean>(false);
  readonly hasMultipleCameras = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly lastScannedCode = signal<string | null>(null);

  private mediaStream: MediaStream | null = null;
  private zxingReader: BrowserMultiFormatReader | null = null;
  private zxingControls: IScannerControls | null = null;
  private nativeBarcodeDetector: any = null;
  private nativeScanTimer: any = null;
  private rotationCanvas: HTMLCanvasElement | null = null;
  private lastScannedTimestamp = 0;
  private isDestroyed = false;

  async ngOnInit(): Promise<void> {
    await this.initBarcodeDetector();
  }

  async ngAfterViewInit(): Promise<void> {
    if (this.active()) {
      await this.startCamera();
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.stopCamera();
    this.stopDetection();
  }

  /**
   * Initializes native BarcodeDetector if supported by the browser.
   */
  private async initBarcodeDetector(): Promise<void> {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const supportedFormats = await (window as any).BarcodeDetector.getSupportedFormats();
        const preferredFormats = [
          'qr_code',
          'ean_13',
          'ean_8',
          'code_128',
          'code_39',
          'upc_a',
          'upc_e',
          'itf',
          'data_matrix',
        ];
        const formatsToUse = preferredFormats.filter((fmt) => supportedFormats.includes(fmt));
        this.nativeBarcodeDetector = new (window as any).BarcodeDetector({
          formats: formatsToUse.length > 0 ? formatsToUse : supportedFormats,
        });
      } catch {
        this.nativeBarcodeDetector = null;
      }
    }
  }

  /**
   * Starts or restarts the camera stream using getUserMedia.
   */
  async startCamera(): Promise<void> {
    this.stopCamera();
    this.errorMessage.set(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const msg = 'Camera access is not supported by your browser or connection is not secure (HTTPS required).';
      this.errorMessage.set(msg);
      this.error.emit(msg);
      return;
    }

    const idealFacingMode = this.camera() === 'rear' ? 'environment' : 'user';
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: idealFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.isDestroyed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      this.mediaStream = stream;
      const video = this.videoElement?.nativeElement;
      if (video) {
        video.srcObject = stream;
        try {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.then === 'function') {
            await playPromise;
          }
        } catch {
          // Autoplay policy or test environment without media playback
        }
      }

      this.isStreaming.set(true);
      await this.inspectCapabilities();
      this.startDetection();
    } catch (err: any) {
      this.isStreaming.set(false);
      let msg = 'Failed to access camera.';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        msg = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        msg = 'No camera device found on this system.';
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        msg = 'Camera is already in use by another application.';
      }
      this.errorMessage.set(msg);
      this.error.emit(msg);
    }
  }

  /**
   * Stops video tracks and hardware camera stream.
   */
  stopCamera(): void {
    this.stopDetection();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      this.mediaStream = null;
    }

    if (this.videoElement?.nativeElement) {
      this.videoElement.nativeElement.srcObject = null;
    }

    this.isStreaming.set(false);
    this.isFlashAvailable.set(false);
    this.rotationCanvas = null;
    if (this.flash()) {
      this.flash.set(false);
    }
  }

  /**
   * Toggles between rear and front cameras.
   */
  async switchCamera(): Promise<void> {
    const nextCamera: CameraFacing = this.camera() === 'rear' ? 'front' : 'rear';
    this.camera.set(nextCamera);

    // If flash was on, reset it since front cameras generally lack torch
    if (this.flash()) {
      this.flash.set(false);
    }

    await this.startCamera();
  }

  /**
   * Toggles flashlight (torch) on/off.
   */
  async toggleFlash(): Promise<void> {
    if (!this.isFlashAvailable() || !this.mediaStream) {
      return;
    }

    const track = this.mediaStream.getVideoTracks()[0];
    if (!track) return;

    const nextFlash = !this.flash();
    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: nextFlash }],
      });
      this.flash.set(nextFlash);
    } catch (err) {
      console.warn('Could not apply flash constraint:', err);
    }
  }

  /**
   * Checks whether the active camera video track supports torch/flash and whether multiple cameras exist.
   */
  private async inspectCapabilities(): Promise<void> {
    if (!this.mediaStream) {
      this.isFlashAvailable.set(false);
      this.hasMultipleCameras.set(false);
      return;
    }

    const track = this.mediaStream.getVideoTracks()[0];
    if (track && typeof track.getCapabilities === 'function') {
      try {
        const caps = track.getCapabilities() as any;
        this.isFlashAvailable.set(Boolean(caps?.torch));
        if (Array.isArray(caps?.facingMode) && caps.facingMode.length > 1) {
          this.hasMultipleCameras.set(true);
        }
      } catch {
        this.isFlashAvailable.set(false);
      }
    } else {
      this.isFlashAvailable.set(false);
    }

    // Enumerate video devices to detect if the system has multiple cameras (e.g. mobile rear + front)
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        if (videoInputs.length > 1) {
          this.hasMultipleCameras.set(true);
        } else if (videoInputs.length === 1) {
          this.hasMultipleCameras.set(false);
        }
      } catch {
        // Fallback to capability check
      }
    }
  }

  /**
   * Starts detection loop via native BarcodeDetector or ZXing fallback.
   */
  private startDetection(): void {
    this.stopDetection();

    if (this.nativeBarcodeDetector) {
      this.runNativeScanLoop();
    } else {
      this.runZxingScanner();
    }
  }

  /**
   * Stops active detection timers or ZXing scanner controls.
   */
  private stopDetection(): void {
    if (this.nativeScanTimer) {
      clearInterval(this.nativeScanTimer);
      this.nativeScanTimer = null;
    }

    if (this.zxingControls) {
      try {
        this.zxingControls.stop();
      } catch {
        // Ignore
      }
      this.zxingControls = null;
    }
  }

  /**
   * Polling loop for native BarcodeDetector with multi-orientation and upside-down support.
   */
  private runNativeScanLoop(): void {
    const video = this.videoElement?.nativeElement;
    if (!video) return;

    this.nativeScanTimer = setInterval(async () => {
      if (this.isDestroyed || !this.isStreaming()) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      try {
        // 1. Primary check: standard orientation (0 deg / 180 deg) directly from video
        let barcodes = await this.nativeBarcodeDetector.detect(video);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          this.handleScannedValue(barcodes[0].rawValue);
          return;
        }

        // 2. Secondary checks: test vertical orientations (90 deg and 270 deg) and inverted (180 deg)
        const checkAngles: Array<90 | 270 | 180> = [90, 270, 180];
        for (const angle of checkAngles) {
          const rotatedCanvas = this.getRotatedCanvas(video, angle);
          if (rotatedCanvas) {
            barcodes = await this.nativeBarcodeDetector.detect(rotatedCanvas);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              this.handleScannedValue(barcodes[0].rawValue);
              return;
            }
          }
        }
      } catch {
        // Detection frame dropped, will retry on next tick
      }
    }, 120);
  }

  /**
   * Generates an offscreen rotated canvas frame to decode upside-down (180 deg) and vertical (90 deg, 270 deg) barcodes.
   * Keeps full original resolution to preserve crisp 1D barcode lines.
   */
  private getRotatedCanvas(video: HTMLVideoElement, degrees: 0 | 90 | 180 | 270): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    const is90or270 = degrees === 90 || degrees === 270;
    const canvasW = is90or270 ? vh : vw;
    const canvasH = is90or270 ? vw : vh;

    if (!this.rotationCanvas) {
      this.rotationCanvas = document.createElement('canvas');
    }

    if (this.rotationCanvas.width !== canvasW || this.rotationCanvas.height !== canvasH) {
      this.rotationCanvas.width = canvasW;
      this.rotationCanvas.height = canvasH;
    }

    const ctx = this.rotationCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.save();
    if (degrees === 90) {
      // 90 degrees CW (vertical left-to-right)
      ctx.translate(vh, 0);
      ctx.rotate(Math.PI / 2);
    } else if (degrees === 180) {
      // 180 degrees upside down
      ctx.translate(vw, vh);
      ctx.rotate(Math.PI);
    } else if (degrees === 270) {
      // 270 degrees CW (90 degrees CCW / vertical right-to-left)
      ctx.translate(0, vw);
      ctx.rotate((3 * Math.PI) / 2);
    }

    ctx.drawImage(video, 0, 0, vw, vh);
    ctx.restore();

    return this.rotationCanvas;
  }

  /**
   * Fallback scanner using @zxing/browser supporting 0, 90, 180, and 270 degree orientations.
   */
  private async runZxingScanner(): Promise<void> {
    const video = this.videoElement?.nativeElement;
    if (!video) return;

    if (typeof document === 'undefined') return;

    try {
      if (!this.zxingReader) {
        const hints = new Map<DecodeHintType, any>();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
        ]);
        this.zxingReader = new BrowserMultiFormatReader(hints);
      }

      const angles: Array<0 | 90 | 270 | 180> = [0, 90, 270, 180];
      let zxingTick = 0;

      this.nativeScanTimer = setInterval(() => {
        if (this.isDestroyed || !this.isStreaming()) return;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

        const angle = angles[zxingTick % angles.length];
        zxingTick++;

        try {
          const canvas = this.getRotatedCanvas(video, angle);
          if (!canvas) return;

          const result = this.zxingReader!.decodeFromCanvas(canvas);
          if (result && !this.isDestroyed) {
            const text = result.getText();
            if (text) {
              this.handleScannedValue(text);
            }
          }
        } catch {
          // Not found on this orientation tick; continue to next
        }
      }, 140);
    } catch (err) {
      console.warn('ZXing initialization failed:', err);
    }
  }

  /**
   * Handles a detected barcode/QR string with anti-bounce, feedback, and emission.
   */
  private handleScannedValue(code: string): void {
    const trimmed = code.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (this.lastScannedCode() === trimmed && now - this.lastScannedTimestamp < this.cooldownMs()) {
      return;
    }

    this.lastScannedCode.set(trimmed);
    this.lastScannedTimestamp = now;

    this.playScanBeep();
    this.triggerHapticPulse();

    this.scanned.emit(trimmed);

    if (!this.continuous()) {
      this.stopDetection();
    }
  }

  /**
   * Synthesizes a subtle, pleasant audio confirmation beep using Web Audio API.
   */
  private playScanBeep(): void {
    if (!this.beepOnScan() || typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.1);

      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 200);
    } catch {
      // Audio autoplay policy might block silent contexts; fail quietly
    }
  }

  /**
   * Triggers device haptic feedback if supported.
   */
  private triggerHapticPulse(): void {
    if (!this.vibrateOnScan() || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(80);
    } catch {
      // Ignore
    }
  }

  /**
   * Emits close event when user clicks the close button.
   */
  onClose(): void {
    this.stopCamera();
    this.close.emit();
  }
}
