import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { LucideCheck, LucideCopy, LucideKey, LucideLock, LucideX } from '@lucide/angular';
import { ApiService } from '../../../../core/api.service.js';
import { ApiKeyDto, CreatedApiKeyDto } from '../../../../core/models.js';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component.js';

@Component({
  selector: 'app-profile-api-keys',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    LucideCheck,
    LucideCopy,
    LucideKey,
    LucideLock,
    LucideX,
  ],
  templateUrl: './profile-api-keys.component.html',
  styleUrl: './profile-api-keys.component.scss',
})
export class ProfileApiKeysComponent {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(Dialog);

  readonly apiKeys = input<ApiKeyDto[]>([]);

  readonly showCreateKeyModal = signal<boolean>(false);
  readonly newKeyName = signal<string>('');
  readonly createdKey = signal<CreatedApiKeyDto | null>(null);
  readonly copied = signal<boolean>(false);
  readonly isGenerating = signal<boolean>(false);

  readonly toast = output<{ type: 'success' | 'error'; message: string }>();
  readonly refreshRequested = output<void>();

  openCreateKeyModal(): void {
    this.newKeyName.set('');
    this.showCreateKeyModal.set(true);
  }

  closeCreateKeyModal(): void {
    this.showCreateKeyModal.set(false);
  }

  async confirmCreateKey(): Promise<void> {
    const name = this.newKeyName().trim();
    if (!name) return;

    this.isGenerating.set(true);
    try {
      const res = await this.api.createApiKey(name);
      this.createdKey.set(res);
      this.copied.set(false);
      this.closeCreateKeyModal();
      this.toast.emit({
        type: 'success',
        message: `API Key "${res.name}" generated successfully`,
      });
      this.refreshRequested.emit();
    } catch {
      this.toast.emit({ type: 'error', message: 'Failed to create API key' });
    } finally {
      this.isGenerating.set(false);
    }
  }

  dismissCreatedKey(): void {
    this.createdKey.set(null);
  }

  async copyRawKey(): Promise<void> {
    const raw = this.createdKey()?.rawKey;
    if (!raw) return;

    try {
      await navigator.clipboard.writeText(raw);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 3000);
    } catch {
      this.toast.emit({ type: 'error', message: 'Failed to copy to clipboard' });
    }
  }

  async revokeApiKey(key: ApiKeyDto): Promise<void> {
    const ref = this.dialog.open(ConfirmModalComponent, {
      data: {
        title: 'Revoke API Key',
        message: `Are you sure you want to revoke API key "${key.name}"? External integrations using this key will immediately lose access.`,
        confirmLabel: 'Revoke Key',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await ref.closed.toPromise();
    if (!confirmed) return;

    try {
      await this.api.revokeApiKey(key.id);
      this.toast.emit({ type: 'success', message: 'API key revoked' });
      this.refreshRequested.emit();
    } catch {
      this.toast.emit({ type: 'error', message: 'Failed to revoke API key' });
    }
  }
}
