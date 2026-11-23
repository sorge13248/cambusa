import { CommonModule } from '@angular/common';
import { Component, computed, ElementRef, inject, OnDestroy, OnInit } from '@angular/core';
import { UndoService } from '../../../core/undo.service.js';

@Component({
  selector: 'app-undo-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './undo-toast.component.html',
  styleUrl: './undo-toast.component.scss',
})
export class UndoToastComponent implements OnInit, OnDestroy {
  private readonly elementRef = inject(ElementRef);
  readonly undoService = inject(UndoService);

  readonly action = computed(() => this.undoService.activeAction());
  readonly isPaused = computed(() => this.undoService.isPaused());

  ngOnInit(): void {
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(this.elementRef.nativeElement);
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined' && this.elementRef.nativeElement.parentElement === document.body) {
      document.body.removeChild(this.elementRef.nativeElement);
    }
  }

  pause() {
    this.undoService.pause();
  }

  resume() {
    this.undoService.resume();
  }

  readonly progressPercentage = computed(() => {
    const act = this.action();
    if (!act || act.totalSeconds <= 0) return 0;
    return (act.remainingSeconds / act.totalSeconds) * 100;
  });

  undo() {
    this.undoService.executeUndo();
  }

  dismiss() {
    this.undoService.dismiss();
  }
}
