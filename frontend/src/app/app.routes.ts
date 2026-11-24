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
    title: 'Sign In',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component.js').then((m) => m.LoginComponent)
  },
  {
    path: 'auth/callback',
    title: 'Authenticating',
    loadComponent: () => import('./features/auth/callback.component.js').then((m) => m.CallbackComponent)
  },
  {
    path: 'home',
    title: 'Dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home.component.js').then((m) => m.HomeComponent)
  },
  {
    path: 'pantry',
    title: 'Pantry',
    canActivate: [authGuard],
    loadComponent: () => import('./features/pantry/pantry.component.js').then((m) => m.PantryComponent)
  },
  {
    path: 'shopping',
    title: 'Shopping List',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shopping/shopping.component.js').then((m) => m.ShoppingComponent)
  },
  {
    path: 'products',
    title: 'Products Catalog',
    canActivate: [authGuard],
    loadComponent: () => import('./features/products/products.component.js').then((m) => m.ProductsComponent)
  },
  {
    path: 'stores',
    redirectTo: 'profile'
  },
  {
    path: 'households',
    title: 'Households',
    canActivate: [authGuard],
    loadComponent: () => import('./features/households/households.component.js').then((m) => m.HouseholdsComponent)
  },
  {
    path: 'profile',
    title: 'Profile & Settings',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile.component.js').then((m) => m.ProfileComponent)
  },
  {
    path: '**',
    redirectTo: 'home'
  }
];
