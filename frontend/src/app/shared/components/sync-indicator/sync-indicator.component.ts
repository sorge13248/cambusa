import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { SyncService, SyncStatus } from '../../../core/sync.service.js';
import { ConfirmModalComponent } from '../confirm-modal/confirm-modal.component.js';

@Component({
  selector: 'app-sync-indicator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sync-indicator.component.html',
  styleUrl: './sync-indicator.component.scss',
})
export class SyncIndicatorComponent implements OnDestroy {
  private readonly elementRef = inject(ElementRef);
  private readonly injector = inject(Injector);
  readonly syncService = inject(SyncService);

  readonly dropdownOpen = signal(false);
  readonly showSuccessCheckmark = signal(false);

  private successTimer: ReturnType<typeof setTimeout> | null = null;
  private previousStatus: SyncStatus | null = null;

  readonly status = computed(() => this.syncService.status());
  readonly pendingCount = computed(() => this.syncService.pendingCount());
  readonly isOnline = computed(() => this.syncService.isOnline());
  readonly lastSyncTime = computed(() => this.syncService.lastSyncTime());
  readonly lastError = computed(() => this.syncService.lastError());

  readonly formattedLastSync = computed(() => {
    const time = this.lastSyncTime();
    if (!time) return 'Never';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(time);
  });

  readonly statusLabel = computed(() => {
    if (this.showSuccessCheckmark() && this.status() === 'online-ok') {
      return 'Synced just now!';
    }
    switch (this.status()) {
      case 'syncing':
        return 'Syncing...';
      case 'online-ok':
        return 'Synced';
      case 'offline':
        return 'Offline';
      case 'conflict':
        return 'Sync conflict';
      case 'error':
        return this.lastError() || 'Sync error';
    }
  });

  readonly tooltip = computed(() => {
    const s = this.status();
    const pending = this.pendingCount();
    const pendingStr = pending > 0 ? ` (${pending} pending)` : '';
    switch (s) {
      case 'syncing':
        return `Syncing...${pendingStr}`;
      case 'online-ok':
        return `Synced${pendingStr}`;
      case 'offline':
        return `Offline${pendingStr}`;
      case 'conflict':
        return `Sync conflict${pendingStr}`;
      case 'error':
        return `${this.lastError() || 'Error'}${pendingStr}`;
    }
  });

  constructor() {
    effect(() => {
      const current = this.status();
      const prev = this.previousStatus;
      this.previousStatus = current;

      if (current === 'error' || current === 'conflict' || current === 'offline') {
        untracked(() => {
          if (this.successTimer) {
            clearTimeout(this.successTimer);
            this.successTimer = null;
          }
          this.showSuccessCheckmark.set(false);
        });
      } else if (prev === 'syncing' && current === 'online-ok') {
        untracked(() => {
          this.triggerSuccessCheckmark();
        });
      }
    });
  }

  triggerSuccessCheckmark(): void {
    if (this.successTimer) {
      clearTimeout(this.successTimer);
      this.successTimer = null;
    }
    this.showSuccessCheckmark.set(true);
    this.successTimer = setTimeout(() => {
      this.showSuccessCheckmark.set(false);
      this.successTimer = null;
    }, 3000);
  }

  toggleDropdown(event?: Event): void {
    event?.stopPropagation();
    this.dropdownOpen.update((open) => !open);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeDropdown();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDropdown();
  }

  async onSyncNow(): Promise<void> {
    this.closeDropdown();
    this.showSuccessCheckmark.set(false);
    await this.syncService.sync();
  }

  async onDownloadServerVersion(): Promise<void> {
    this.closeDropdown();

    const dialog = this.injector.get(Dialog);
    const dialogRef = dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Download server version?',
        message:
          'This operation will replace all local data with the latest version from the server. Any unsaved or un-synced local changes will be lost. Do you want to continue?',
        confirmLabel: 'Download from server',
        cancelLabel: 'Cancel',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (!confirmed) return;

    await this.syncService.downloadServerVersion();
  }

  ngOnDestroy(): void {
    if (this.successTimer) {
      clearTimeout(this.successTimer);
      this.successTimer = null;
    }
  }
}
