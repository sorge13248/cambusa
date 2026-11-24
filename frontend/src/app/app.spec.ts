import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from './app';
import { PwaUpdateService } from './core/pwa-update.service.js';

describe('App', () => {
  const mockPwaUpdate = {
    init: vi.fn(),
    updateAvailable: signal(false),
    promptUpdate: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: PwaUpdateService, useValue: mockPwaUpdate },
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render brand title in navbar', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-name')?.textContent).toContain('Cambusa');
  });

  it('should initialize pwa update service on ngOnInit', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await app.ngOnInit();
    expect(mockPwaUpdate.init).toHaveBeenCalled();
  });
});
