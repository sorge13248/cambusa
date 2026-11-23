import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UndoToastComponent } from './undo-toast.component.js';
import { UndoService } from '../../../core/undo.service.js';

describe('UndoToastComponent', () => {
  let component: UndoToastComponent;
  let fixture: ComponentFixture<UndoToastComponent>;
  let undoService: UndoService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UndoToastComponent],
      providers: [UndoService],
    }).compileComponents();

    undoService = TestBed.inject(UndoService);
    fixture = TestBed.createComponent(UndoToastComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and remain hidden when no active undo action exists', () => {
    expect(component).toBeTruthy();
    expect(component.action()).toBeNull();
  });

  it('should display action description when registered', () => {
    undoService.register('Moved item to freezer', vi.fn(), 10);
    fixture.detectChanges();

    expect(component.action()).not.toBeNull();
    expect(component.action()?.description).toBe('Moved item to freezer');
  });
});
