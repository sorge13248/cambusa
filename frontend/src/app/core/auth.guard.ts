import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service.js';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoading()) {
    await auth.init();
  }

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: state.url && state.url !== '/' && state.url !== '/login' ? { returnUrl: state.url } : undefined,
  });
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoading()) {
    await auth.init();
  }

  if (auth.isAuthenticated()) {
    return router.createUrlTree(['/home']);
  }

  return true;
};
