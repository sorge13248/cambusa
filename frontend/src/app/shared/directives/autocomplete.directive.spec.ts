import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AutocompleteDirective, AutocompleteOption } from './autocomplete.directive.js';

@Component({
  standalone: true,
  imports: [AutocompleteDirective],
  template: `
    <input
      type="text"
      [appAutocomplete]="options"
      [(selectedId)]="selectedId"
      (validityChange)="onValidityChange($event)"
    />
  `,
})
class TestHostComponent {
  options: AutocompleteOption[] = [
    { id: '1', label: 'Apple' },
    { id: '2', label: 'Banana' },
    { id: '3', label: 'Orange' },
  ];
  selectedId: string | null = null;
  isValid = true;

  onValidityChange(valid: boolean) {
    this.isValid = valid;
  }
}

describe('AutocompleteDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let inputEl: HTMLInputElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    inputEl = fixture.nativeElement.querySelector('input');
  });

  afterEach(() => {
    // Clean up any dropdown panels appended to body
    document.querySelectorAll('.autocomplete-dropdown-panel').forEach((el) => el.remove());
  });

  it('should initialize and attach input', () => {
    expect(inputEl).toBeTruthy();
  });

  it('should filter options on input and open dropdown in document.body', () => {
    inputEl.value = 'app';
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const panel = document.querySelector('.autocomplete-dropdown-panel') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.style.display).toBe('block');

    const options = panel.querySelectorAll('.autocomplete-option-item');
    expect(options.length).toBe(1);
    expect(options[0].textContent).toContain('Apple');
  });

  it('should navigate options with ArrowDown and ArrowUp and select with Enter', () => {
    inputEl.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const panel = document.querySelector('.autocomplete-dropdown-panel') as HTMLElement;
    expect(panel).toBeTruthy();

    // Arrow down to first option ('Apple')
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();

    // Arrow down to second option ('Banana')
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();

    // Press Enter to select
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(host.selectedId).toBe('2');
    expect(inputEl.value).toBe('Banana');
    expect(panel.style.display).toBe('none');
  });

  it('should close on Escape', () => {
    inputEl.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const panel = document.querySelector('.autocomplete-dropdown-panel') as HTMLElement;
    expect(panel.style.display).toBe('block');

    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(panel.style.display).toBe('none');
  });
});
