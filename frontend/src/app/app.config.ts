import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { DEFAULT_DIALOG_CONFIG } from '@angular/cdk/dialog';
import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' })
    ),
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
