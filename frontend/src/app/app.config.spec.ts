// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ViewportScroller } from '@angular/common';
import { Component } from '@angular/core';
import { appConfig } from './app.config.js';
import { DEFAULT_DIALOG_CONFIG, Dialog } from '@angular/cdk/dialog';
import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { NavigationEnd, NavigationSkipped, NavigationSkippedCode, Router, TitleStrategy } from '@angular/router';
import { Subject } from 'rxjs';
import { CambusaTitleStrategy } from './core/title-strategy.js';

@Component({
  standalone: true,
  template: '<div class="test-dialog">Test Dialog</div>',
})
class TestModalComponent {}

describe('AppConfig', () => {
  it('should provide DEFAULT_DIALOG_CONFIG with hasBackdrop and closeOnNavigation configured', () => {
    const dialogProvider = appConfig.providers.find(
      (p: any) => p && p.provide === DEFAULT_DIALOG_CONFIG
    ) as any;

    expect(dialogProvider).toBeDefined();
    expect(dialogProvider.useValue).toEqual({
      hasBackdrop: true,
      closeOnNavigation: false,
    });
  });

  it('should provide OVERLAY_DEFAULT_CONFIG with usePopover set to false for backdrop filter blur support', () => {
    const overlayProvider = appConfig.providers.find(
      (p: any) => p && p.provide === OVERLAY_DEFAULT_CONFIG
    ) as any;

    expect(overlayProvider).toBeDefined();
    expect(overlayProvider.useValue).toEqual({ usePopover: false });
  });

  it('should provide TitleStrategy with CambusaTitleStrategy', () => {
    const titleProvider = appConfig.providers.find(
      (p: any) => p && p.provide === TitleStrategy
    ) as any;

    expect(titleProvider).toBeDefined();
    expect(titleProvider.useClass).toBe(CambusaTitleStrategy);
  });

  it('should open dialog with standard DOM overlay container and backdrop without popover attribute', () => {
    TestBed.configureTestingModule({
      providers: appConfig.providers,
    });

    const dialog = TestBed.inject(Dialog);
    const dialogRef = dialog.open(TestModalComponent);

    const overlayContainer = document.querySelector('.cdk-overlay-container');
    expect(overlayContainer).not.toBeNull();

    const backdrop = document.querySelector('.cdk-overlay-backdrop');
    expect(backdrop).not.toBeNull();

    const popoverElements = document.querySelectorAll('[popover]');
    expect(popoverElements.length).toBe(0);

    dialogRef.close();
  });

  it('should scroll to top on NavigationEnd and NOT scroll on NavigationSkipped (e.g. modal close popstate)', () => {
    const events$ = new Subject<any>();
    const scrollToPositionSpy = vi.fn();
    const setHistoryScrollRestorationSpy = vi.fn();
    const origRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof requestAnimationFrame;

    try {
      TestBed.configureTestingModule({
        providers: [
          ...appConfig.providers,
          { provide: Router, useValue: { events: events$.asObservable() } },
          {
            provide: ViewportScroller,
            useValue: {
              scrollToPosition: scrollToPositionSpy,
              setHistoryScrollRestoration: setHistoryScrollRestorationSpy,
            },
          },
        ],
      });

      // Trigger environment initializers by injecting Router
      TestBed.inject(Router);

      expect(setHistoryScrollRestorationSpy).toHaveBeenCalledWith('manual');

      events$.next(new NavigationSkipped(1, '/pantry', 'IgnoredSameUrlNavigation', NavigationSkippedCode.IgnoredSameUrlNavigation));
      expect(scrollToPositionSpy).not.toHaveBeenCalled();

      events$.next(new NavigationEnd(2, '/products', '/products'));
      expect(scrollToPositionSpy).toHaveBeenCalledWith([0, 0], { behavior: 'instant' });
    } finally {
      globalThis.requestAnimationFrame = origRaf;
    }
  });
});

