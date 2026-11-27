import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, DestroyRef, effect, HostListener, inject, input, output } from '@angular/core';
import { LucideX } from '@lucide/angular';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, LucideX],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = input<boolean>(false);
  readonly backdrop = input<boolean>(true);
  readonly position = input<'left' | 'right'>('right');
  readonly width = input<string>('380px');
  readonly title = input<string>('');
  readonly ariaLabel = input<string>('Sidebar');

  readonly closed = output<void>();

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const hasBackdrop = this.backdrop();
      const pos = this.position();
      const width = this.width();

      this.syncPushLayout(isOpen && !hasBackdrop, pos, width);
    });

    this.destroyRef.onDestroy(() => {
      this.clearPushLayout();
    });
  }

  private syncPushLayout(shouldPush: boolean, pos: 'left' | 'right', width: string): void {
    const root = this.document.documentElement;
    const body = this.document.body;

    if (!shouldPush) {
      this.clearPushLayout();
      return;
    }

    if (pos === 'right') {
      root.style.setProperty('--sidebar-push-right', width);
      root.style.removeProperty('--sidebar-push-left');
      body.classList.add('has-push-sidebar-right');
      body.classList.remove('has-push-sidebar-left');
    } else {
      root.style.setProperty('--sidebar-push-left', width);
      root.style.removeProperty('--sidebar-push-right');
      body.classList.add('has-push-sidebar-left');
      body.classList.remove('has-push-sidebar-right');
    }
  }

  private clearPushLayout(): void {
    const root = this.document.documentElement;
    const body = this.document.body;
    root.style.removeProperty('--sidebar-push-right');
    root.style.removeProperty('--sidebar-push-left');
    body.classList.remove('has-push-sidebar-right', 'has-push-sidebar-left');
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    if (this.backdrop()) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.open() && this.backdrop()) {
      this.close();
    }
  }
}
