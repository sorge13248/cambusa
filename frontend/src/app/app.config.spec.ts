// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { appConfig } from './app.config.js';
import { DEFAULT_DIALOG_CONFIG, Dialog } from '@angular/cdk/dialog';
import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { TitleStrategy } from '@angular/router';
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
});

