// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, NgZone, runInInjectionContext } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Subject } from 'rxjs';
import { BackNavigationService, CollapsibleToggleable } from './back-navigation.service.js';

describe('BackNavigationService', () => {
  let service: BackNavigationService;
  let dialogMock: {
    afterOpened: Subject<any>;
    openDialogs: any[];
  };
  let ngZoneMock: {
    run: (fn: Function) => any;
  };

  beforeEach(() => {
    dialogMock = {
      afterOpened: new Subject<any>(),
      openDialogs: [],
    };
    ngZoneMock = {
      run: (fn: Function) => fn(),
    };

    const injector = Injector.create({
      providers: [
        { provide: Dialog, useValue: dialogMock },
        { provide: NgZone, useValue: ngZoneMock },
      ],
    });

    runInInjectionContext(injector, () => {
      service = new BackNavigationService();
    });

    vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  it('should initialize and register event listeners', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    service.init();
    expect(addEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function));
  });

  it('should close all open collapsibles on popstate before touching dialogs', () => {
    service.init();

    const collapsible1: CollapsibleToggleable = {
      close: vi.fn(),
      isSectionExpanded: () => true,
    };
    const collapsible2: CollapsibleToggleable = {
      close: vi.fn(),
      isSectionExpanded: () => true,
    };

    service.registerCollapsibleOpen(collapsible1);
    service.registerCollapsibleOpen(collapsible2);

    expect(service.hasOpenCollapsibles()).toBe(true);
    expect(service.getOpenCollapsiblesCount()).toBe(2);

    // Trigger popstate
    service.handlePopstate(new PopStateEvent('popstate'));

    expect(collapsible1.close).toHaveBeenCalled();
    expect(collapsible2.close).toHaveBeenCalled();
    expect(service.hasOpenCollapsibles()).toBe(false);
  });

  it('should close topmost dialog in LIFO order when popstate occurs without open collapsibles', () => {
    service.init();

    const dialog1 = { id: 'd1', close: vi.fn(), closed: new Subject<void>() };
    const dialog2 = { id: 'd2', close: vi.fn(), closed: new Subject<void>() };

    dialogMock.openDialogs = [dialog1, dialog2];

    // Trigger popstate
    service.handlePopstate(new PopStateEvent('popstate'));

    // Topmost dialog (dialog2) must be closed
    expect(dialog2.close).toHaveBeenCalled();
    expect(dialog1.close).not.toHaveBeenCalled();
  });

  it('should not call history.back when collapsible is closed via mouse', () => {
    service.init();
    const collapsible: CollapsibleToggleable = {
      close: vi.fn(),
      isSectionExpanded: () => true,
    };

    service.registerCollapsibleOpen(collapsible);
    expect(service.hasOpenCollapsibles()).toBe(true);

    service.registerCollapsibleClosed(collapsible);
    expect(service.hasOpenCollapsibles()).toBe(false);
    expect(window.history.back).not.toHaveBeenCalled();
  });

  it('should re-push dialog state if collapsibles were closed while a dialog is open', () => {
    service.init();
    const dialog1 = { id: 'd1', close: vi.fn(), closed: new Subject<void>() };
    dialogMock.openDialogs = [dialog1];

    const collapsible: CollapsibleToggleable = {
      close: vi.fn(),
      isSectionExpanded: () => true,
    };
    service.registerCollapsibleOpen(collapsible);

    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    pushStateSpy.mockClear();

    // Trigger popstate
    service.handlePopstate(new PopStateEvent('popstate'));

    // Collapsible closed
    expect(collapsible.close).toHaveBeenCalled();
    // Dialog NOT closed
    expect(dialog1.close).not.toHaveBeenCalled();
    // Re-pushed dialog state
    expect(pushStateSpy).toHaveBeenCalledWith({ cambusaType: 'dialog' }, '');
  });
});
