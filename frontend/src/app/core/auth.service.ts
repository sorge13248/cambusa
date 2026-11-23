import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Injectable, NgZone, signal, untracked } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ApiService } from './api.service.js';
import { User, UserHouseholdSummary } from './models.js';
import { ConfirmModalComponent } from '../shared/components/confirm-modal/confirm-modal.component.js';

const RETURN_URL_STORAGE_KEY = 'cambusa_auth_return_url';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(Dialog);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentUser = signal<User | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly displayName = computed(() => this.currentUser()?.displayName ?? '');
  readonly pictureUrl = computed(() => this.currentUser()?.pictureUrl ?? null);
  readonly initials = computed(() => {
    const source = (this.currentUser()?.displayName ?? '').trim();
    return (
      source
        .split(/\s+/)
        .map((part) => part.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'C'
    );
  });
  readonly households = signal<UserHouseholdSummary[]>([]);
  readonly activeHouseholdId = signal<string | null>(null);
  readonly pendingInvitationsCount = signal<number>(0);
  readonly isLoading = signal<boolean>(true);

  private sessionPingTimer: ReturnType<typeof setTimeout> | null = null;
  private isRenewingSession = false;
  private silentRefreshPromise: Promise<boolean> | null = null;
  private lastRefreshedAt = Date.now();
  private sessionExpiredModalOpen = false;

  sessionPingIntervalMs = 30_000;
  proactiveRefreshIntervalMs = 4 * 60_000;

  readonly activeHousehold = computed(() => {
    const id = this.activeHouseholdId();
    if (!id) return null;
    return this.households().find((h) => h.id === id) ?? null;
  });

  constructor() {
    effect(() => {
      const authenticated = this.isAuthenticated();
      untracked(() => {
        if (authenticated) {
          this.startSessionPing();
        } else {
          this.stopSessionPing();
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.stopSessionPing();
    });

    // Proactive refresh check on tab visibility change or window focus
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const onVisibilityOrFocus = () => {
        if (document.visibilityState === 'visible' && this.isAuthenticated()) {
          const elapsed = Date.now() - this.lastRefreshedAt;
          if (elapsed >= this.proactiveRefreshIntervalMs) {
            void this.silentRefresh();
          }
        }
      };

      document.addEventListener('visibilitychange', onVisibilityOrFocus);
      window.addEventListener('focus', onVisibilityOrFocus);

      this.destroyRef.onDestroy(() => {
        document.removeEventListener('visibilitychange', onVisibilityOrFocus);
        window.removeEventListener('focus', onVisibilityOrFocus);
      });
    }
  }

  async init(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await this.api.getMe();
      this.currentUser.set(data.user);
      this.households.set(data.households);
      this.pendingInvitationsCount.set(data.pendingInvitationsCount);

      // Restore stored active household if valid
      const storedHhId = localStorage.getItem('cambusa_active_household');
      const validStored = data.households.some((h) => h.id === storedHhId);

      const targetId = validStored ? storedHhId : data.activeHouseholdId ?? data.households[0]?.id ?? null;
      this.switchHousehold(targetId);
      this.lastRefreshedAt = Date.now();
    } catch {
      this.currentUser.set(null);
      this.households.set([]);
      this.activeHouseholdId.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  switchHousehold(householdId: string | null): void {
    this.activeHouseholdId.set(householdId);
    this.api.activeHouseholdId.set(householdId);
    if (householdId) {
      localStorage.setItem('cambusa_active_household', householdId);
    } else {
      localStorage.removeItem('cambusa_active_household');
    }
  }

  async refreshHouseholds(): Promise<void> {
    try {
      const list = await this.api.getHouseholds();
      this.households.set(list);

      const current = this.activeHouseholdId();
      if (!current || !list.some((h) => h.id === current)) {
        this.switchHousehold(list[0]?.id ?? null);
      }
    } catch {
      // ignore
    }
  }

  login(): void {
    this.rememberCurrentUrl();
    window.location.href = '/api/auth/login';
  }

  async logout(): Promise<void> {
    this.stopSessionPing();
    await this.api.logout();
    this.currentUser.set(null);
    this.households.set([]);
    this.switchHousehold(null);
    window.location.href = '/api/auth/login';
  }

  startSessionPing(): void {
    this.stopSessionPing();

    if (!this.isAuthenticated() || this.isRenewingSession || this.sessionExpiredModalOpen) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.sessionPingTimer = setTimeout(async () => {
        this.sessionPingTimer = null;
        await this.checkSession();
        if (this.isAuthenticated() && !this.isRenewingSession && !this.sessionExpiredModalOpen) {
          this.startSessionPing();
        }
      }, this.sessionPingIntervalMs);
    });
  }

  stopSessionPing(): void {
    if (this.sessionPingTimer) {
      clearTimeout(this.sessionPingTimer);
      this.sessionPingTimer = null;
    }
  }

  async checkSession(): Promise<boolean> {
    if (!this.isAuthenticated() || this.isRenewingSession || this.sessionExpiredModalOpen) {
      return false;
    }

    // Proactive continuous refresh: if interval elapsed, refresh before token expires
    const elapsed = Date.now() - this.lastRefreshedAt;
    if (elapsed >= this.proactiveRefreshIntervalMs) {
      const refreshed = await this.silentRefresh();
      if (refreshed) {
        return true;
      }
    }

    try {
      const data = await this.api.getMe();
      if (!this.isAuthenticated() || this.isRenewingSession || this.sessionExpiredModalOpen) {
        return false;
      }

      if (data?.user) {
        this.ngZone.run(() => {
          this.currentUser.set(data.user);
          this.households.set(data.households);
          this.pendingInvitationsCount.set(data.pendingInvitationsCount);
        });
        return true;
      }

      this.handleSessionExpired();
      return false;
    } catch (err: unknown) {
      if (!this.isAuthenticated() || this.isRenewingSession || this.sessionExpiredModalOpen) {
        return false;
      }

      if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
        this.handleSessionExpired();
        return false;
      }

      return true;
    }
  }

  silentRefresh(): Promise<boolean> {
    if (this.silentRefreshPromise) {
      return this.silentRefreshPromise;
    }

    this.silentRefreshPromise = this.doSilentRefresh().finally(() => {
      this.silentRefreshPromise = null;
    });

    return this.silentRefreshPromise;
  }

  private async doSilentRefresh(): Promise<boolean> {
    try {
      const res = await this.api.refresh();
      if (res?.refreshed) {
        this.lastRefreshedAt = Date.now();
        if (res.expiresIn && res.expiresIn > 60) {
          this.proactiveRefreshIntervalMs = Math.max(60_000, (res.expiresIn - 60) * 1000);
        }
        await this.loadProfileSilently();
        return true;
      }
    } catch {
      // Refresh failed
    }
    return false;
  }

  private async loadProfileSilently(): Promise<boolean> {
    try {
      const data = await this.api.getMe();
      if (data?.user) {
        this.ngZone.run(() => {
          this.currentUser.set(data.user);
          this.households.set(data.households);
          this.pendingInvitationsCount.set(data.pendingInvitationsCount);
        });
        return true;
      }
    } catch {
      // Ignored
    }
    return false;
  }

  handleSessionExpired(): void {
    this.stopSessionPing();

    this.ngZone.run(() => {
      this.currentUser.set(null);
      this.households.set([]);
      this.switchHousehold(null);

      if (this.sessionExpiredModalOpen) {
        return;
      }
      this.sessionExpiredModalOpen = true;

      const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
        disableClose: true,
        data: {
          title: 'Session Expired',
          message: 'Your authentication session has expired. Please refresh the page to renew your session and continue using Cambusa.',
          confirmLabel: 'Refresh Page',
          showCancel: false,
          confirmVariant: 'primary',
        },
      });

      dialogRef.closed.subscribe(() => {
        this.sessionExpiredModalOpen = false;
        this.reloadPage();
      });
    });
  }

  reloadPage(): void {
    if (typeof window !== 'undefined' && window.location) {
      try {
        window.location.reload();
      } catch {
        // Ignored in non-browser or test environments
      }
    }
  }

  rememberCurrentUrl(): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const path = window.location.pathname + window.location.search;
        if (path && path !== '/login' && !path.startsWith('/auth/callback')) {
          window.sessionStorage.setItem(RETURN_URL_STORAGE_KEY, path);
        }
      }
    } catch {
      // Ignored
    }
  }

  consumeReturnUrl(): string | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const url = window.sessionStorage.getItem(RETURN_URL_STORAGE_KEY);
        window.sessionStorage.removeItem(RETURN_URL_STORAGE_KEY);
        return url;
      }
    } catch {
      // Ignored
    }
    return null;
  }
}
