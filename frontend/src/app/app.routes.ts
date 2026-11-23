import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard.js';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home'
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component.js').then((m) => m.LoginComponent)
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/callback.component.js').then((m) => m.CallbackComponent)
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home.component.js').then((m) => m.HomeComponent)
  },
  {
    path: 'pantry',
    canActivate: [authGuard],
    loadComponent: () => import('./features/pantry/pantry.component.js').then((m) => m.PantryComponent)
  },
  {
    path: 'shopping',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shopping/shopping.component.js').then((m) => m.ShoppingComponent)
  },
  {
    path: 'products',
    canActivate: [authGuard],
    loadComponent: () => import('./features/products/products.component.js').then((m) => m.ProductsComponent)
  },
  {
    path: 'stores',
    canActivate: [authGuard],
    loadComponent: () => import('./features/stores/stores.component.js').then((m) => m.StoresComponent)
  },
  {
    path: 'households',
    canActivate: [authGuard],
    loadComponent: () => import('./features/households/households.component.js').then((m) => m.HouseholdsComponent)
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile.component.js').then((m) => m.ProfileComponent)
  },
  {
    path: '**',
    redirectTo: 'home'
  }
];
