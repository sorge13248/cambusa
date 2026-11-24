import { Injectable, signal } from '@angular/core';

export interface UndoAction {
  id: string;
  description: string;
  remainingSeconds: number;
  totalSeconds: number;
  undo: () => Promise<void>;
}

export interface RegisterUndoOptions {
  description: string;
  onUndo?: () => Promise<void>;
  undo?: () => Promise<void>;
  durationSeconds?: number;
}

@Injectable({ providedIn: 'root' })
export class UndoService {
  readonly activeAction = signal<UndoAction | null>(null);
  readonly isPaused = signal<boolean>(false);
  readonly onUndoExecuted = signal<number>(0);

  private timerInterval: any = null;
  private actionCounter = 0;
  private expiresAt = 0;
  private pausedRemainingMs = 0;

  /**
   * Registers an action that can be undone within 10 seconds.
   */
  register(
    descOrOptions: string | RegisterUndoOptions,
    undoFn?: () => Promise<void>,
    durationSeconds = 10,
  ): string {
    this.clearTimer();

    let description: string;
    let fn: () => Promise<void>;
    let dur = durationSeconds;

    if (typeof descOrOptions === 'object') {
      description = descOrOptions.description;
      fn = descOrOptions.onUndo || descOrOptions.undo || (async () => {});
      if (descOrOptions.durationSeconds) dur = descOrOptions.durationSeconds;
    } else {
      description = descOrOptions;
      fn = undoFn || (async () => {});
    }

    const id = `undo-${++this.actionCounter}-${Date.now()}`;
    const action: UndoAction = {
      id,
      description,
      remainingSeconds: dur,
      totalSeconds: dur,
      undo: fn,
    };

    this.activeAction.set(action);
    this.expiresAt = Date.now() + dur * 1000;
    this.pausedRemainingMs = 0;
    this.isPaused.set(false);

    this.startInterval(id);
    return id;
  }

  pause(): void {
    if (!this.activeAction() || this.isPaused()) return;
    this.pausedRemainingMs = Math.max(0, this.expiresAt - Date.now());
    this.isPaused.set(true);
  }

  resume(): void {
    if (!this.activeAction() || !this.isPaused()) return;
    this.expiresAt = Date.now() + this.pausedRemainingMs;
    this.isPaused.set(false);
  }

  private startInterval(id: string) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.isPaused()) return;
      const remainingMs = this.expiresAt - Date.now();
      if (remainingMs <= 0) {
        this.dismiss();
      } else {
        const current = this.activeAction();
        if (current && current.id === id) {
          const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
          this.activeAction.set({
            ...current,
            remainingSeconds: remainingSec,
          });
        }
      }
    }, 100);
  }

  async executeUndo(): Promise<boolean> {
    const action = this.activeAction();
    if (!action) return false;

    this.dismiss();
    try {
      await action.undo();
      this.onUndoExecuted.update((c) => c + 1);
      return true;
    } catch (err) {
      console.error('Error executing undo:', err);
      return false;
    }
  }

  dismiss() {
    this.clearTimer();
    this.activeAction.set(null);
  }

  private clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.isPaused.set(false);
  }
}
