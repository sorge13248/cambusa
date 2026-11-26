import { ViewportScroller } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners, provideEnvironmentInitializer } from '@angular/core';
import { NavigationEnd, Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { DEFAULT_DIALOG_CONFIG } from '@angular/cdk/dialog';
import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { filter } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { CambusaTitleStrategy } from './core/title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideRouter(
      routes,
      withComponentInputBinding()
    ),
    provideEnvironmentInitializer(() => {
      const router = inject(Router);
      const viewportScroller = inject(ViewportScroller);
      viewportScroller.setHistoryScrollRestoration('manual');
      router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(() => {
          if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => {
              viewportScroller.scrollToPosition([0, 0], { behavior: 'instant' });
            });
          } else {
            viewportScroller.scrollToPosition([0, 0], { behavior: 'instant' });
          }
        });
    }),
    {
      provide: TitleStrategy,
      useClass: CambusaTitleStrategy,
    },
    {
      provide: DEFAULT_DIALOG_CONFIG,
      useValue: {
        hasBackdrop: true,
        closeOnNavigation: false,
      },
    },
    {
      provide: OVERLAY_DEFAULT_CONFIG,
      useValue: {
        usePopover: false,
      },
    },
  ]
};
