import { inject, Injectable, NgZone } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';

export interface CollapsibleToggleable {
  close(): void;
  isSectionExpanded(): boolean;
}

@Injectable({
  providedIn: 'root',
})
export class BackNavigationService {
  private readonly dialog = inject(Dialog);
  private readonly ngZone = inject(NgZone);

  private readonly openCollapsibles = new Set<CollapsibleToggleable>();
  private hasCollapsibleHistoryState = false;
  private programmaticPops = 0;
  private isPopstateClosing = false;
  private initialized = false;

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    window.addEventListener('popstate', (event) => this.handlePopstate(event));

    this.dialog.afterOpened.subscribe((dialogRef) => {
      this.handleDialogOpened(dialogRef);
    });
  }

  private handleDialogOpened(dialogRef: DialogRef): void {
    if (typeof window === 'undefined') return;
    window.history.pushState({ cambusaType: 'dialog', id: dialogRef.id }, '');

    dialogRef.closed.subscribe(() => {
      if (this.isPopstateClosing) {
        return;
      }
      this.programmaticPops++;
      window.history.back();
    });
  }

  registerCollapsibleOpen(collapsible: CollapsibleToggleable): void {
    this.openCollapsibles.add(collapsible);
    // Only push collapsible history state if no dialog is currently open
    // (inside a dialog, the dialog already holds the history state)
    if (this.dialog.openDialogs.length === 0 && !this.hasCollapsibleHistoryState && typeof window !== 'undefined') {
      this.hasCollapsibleHistoryState = true;
      window.history.pushState({ cambusaType: 'collapsible' }, '');
    }
  }

  registerCollapsibleClosed(collapsible: CollapsibleToggleable): void {
    this.openCollapsibles.delete(collapsible);
    // Closing a collapsible via mouse must NEVER call window.history.back() or close open dialogs
  }

  unregisterOnDestroy(collapsible: CollapsibleToggleable): void {
    this.openCollapsibles.delete(collapsible);
    if (this.openCollapsibles.size === 0) {
      this.hasCollapsibleHistoryState = false;
    }
  }

  hasOpenCollapsibles(): boolean {
    return this.openCollapsibles.size > 0;
  }

  getOpenCollapsiblesCount(): number {
    return this.openCollapsibles.size;
  }

  handlePopstate(_event: PopStateEvent): void {
    if (this.programmaticPops > 0) {
      this.programmaticPops--;
      return;
    }

    // 1. If any collapsibles are open, close all of them first
    if (this.openCollapsibles.size > 0) {
      const collapsibles = Array.from(this.openCollapsibles);
      this.openCollapsibles.clear();
      this.hasCollapsibleHistoryState = false;

      this.ngZone.run(() => {
        for (const c of collapsibles) {
          c.close();
        }
      });

      // If a dialog is open, the popstate event popped the dialog's history entry.
      // Re-push it immediately so the dialog remains protected for the next Back press!
      if (this.dialog.openDialogs.length > 0 && typeof window !== 'undefined') {
        window.history.pushState({ cambusaType: 'dialog' }, '');
      }
      return;
    }

    // 2. If any dialogs are open, close the topmost dialog in LIFO order
    const openDialogs = this.dialog.openDialogs;
    if (openDialogs.length > 0) {
      const topDialog = openDialogs[openDialogs.length - 1];
      this.isPopstateClosing = true;
      this.ngZone.run(() => {
        topDialog.close();
      });
      setTimeout(() => {
        this.isPopstateClosing = false;
      }, 150);
      return;
    }

    // 3. Otherwise, browser history back proceeds normally
  }
}
