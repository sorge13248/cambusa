import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Injectable, Injector, NgZone, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service.js';
import { User, UserHouseholdSummary } from './models.js';

export interface MinimalCachedUser {
  id: string;
  displayName: string;
  pictureUrl?: string | null;
}

const AUTH_STORAGE_KEY = 'cambusa_auth_user';
const RETURN_URL_STORAGE_KEY = 'cambusa_auth_return_url';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly injector = inject(Injector);
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
  private initPromise: Promise<void> | null = null;
  private lastRefreshedAt = Date.now();

  sessionPingIntervalMs = 30_000;
  proactiveRefreshIntervalMs = 4 * 60_000;

  readonly activeHousehold = computed(() => {
    const id = this.activeHouseholdId();
    if (!id) return null;
    return this.households().find((h) => h.id === id) ?? null;
  });

  constructor() {
    const cached = this.getCachedUser();
    if (cached) {
      this.currentUser.set(cached);
      this.isLoading.set(false);
    }

    effect(
      () => {
        const authenticated = this.isAuthenticated();
        untracked(() => {
          if (authenticated) {
            this.startSessionPing();
          } else {
            this.stopSessionPing();
          }
        });
      },
      { injector: this.injector },
    );

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

  getCachedUser(): User | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<MinimalCachedUser>;
          if (parsed && typeof parsed.displayName === 'string' && parsed.displayName.trim()) {
            return {
              id: typeof parsed.id === 'string' ? parsed.id : '',
              displayName: parsed.displayName,
              pictureUrl: typeof parsed.pictureUrl === 'string' ? parsed.pictureUrl : null,
              email: null,
            };
          }
        }
      }
    } catch {
      // Ignored
    }
    return null;
  }

  hasCachedUser(): boolean {
    return this.getCachedUser() !== null;
  }

  setCachedUser(user: User | null): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (user?.displayName) {
          const minimal: MinimalCachedUser = {
            id: user.id,
            displayName: user.displayName,
            pictureUrl: user.pictureUrl ?? null,
          };
          window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(minimal));
        } else {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
    } catch {
      // Ignored
    }
  }

  async waitUntilInitialized(timeoutMs = 5000): Promise<void> {
    if (!this.isLoading()) {
      return;
    }

    await new Promise<void>((resolve) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (!this.isLoading() || Date.now() - startedAt >= timeoutMs) {
          clearInterval(timer);
          resolve();
        }
      }, 25);
    });
  }

  init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.doInit().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    if (!this.currentUser()) {
      this.isLoading.set(true);
    }
    try {
      let data;
      try {
        data = await this.api.getMe();
      } catch (err) {
        // Access token expired, attempt transparent silent refresh using the 30-day refresh token cookie
        const refreshed = await this.silentRefresh();
        if (refreshed) {
          data = await this.api.getMe();
        } else {
          throw err;
        }
      }

      this.currentUser.set(data.user);
      this.setCachedUser(data.user);
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
      this.setCachedUser(null);
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
    this.setCachedUser(null);
    await this.api.logout();
    this.currentUser.set(null);
    this.households.set([]);
    this.switchHousehold(null);
    window.location.href = '/api/auth/login';
  }

  startSessionPing(): void {
    this.stopSessionPing();

    if (!this.isAuthenticated() || this.isRenewingSession) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.sessionPingTimer = setTimeout(async () => {
        this.sessionPingTimer = null;
        await this.checkSession();
        if (this.isAuthenticated() && !this.isRenewingSession) {
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
    if (!this.isAuthenticated() || this.isRenewingSession) {
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
      if (!this.isAuthenticated() || this.isRenewingSession) {
        return false;
      }

      if (data?.user) {
        this.ngZone.run(() => {
          this.currentUser.set(data.user);
          this.setCachedUser(data.user);
          this.households.set(data.households);
          this.pendingInvitationsCount.set(data.pendingInvitationsCount);
        });
        return true;
      }

      this.handleSessionExpired();
      return false;
    } catch (err: unknown) {
      if (!this.isAuthenticated() || this.isRenewingSession) {
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
          this.setCachedUser(data.user);
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
    this.setCachedUser(null);
    this.currentUser.set(null);
    this.households.set([]);
    this.switchHousehold(null);

    void this.renewSession();
  }

  async renewSession(): Promise<boolean> {
    if (this.isRenewingSession) {
      return false;
    }
    this.isRenewingSession = true;
    this.stopSessionPing();

    try {
      // 1. Prova prima il refresh silenzioso con token endpoint (/api/auth/refresh)
      const refreshed = await this.silentRefresh();
      if (refreshed && this.isAuthenticated()) {
        this.startSessionPing();
        return true;
      }

      // 2. Se il refresh token non è presente o è scaduto, rinnova immediatamente la sessione via OIDC SSO
      this.setCachedUser(null);
      this.currentUser.set(null);
      this.rememberCurrentUrl();
      this.login();
      return true;
    } catch {
      this.setCachedUser(null);
      this.currentUser.set(null);
      try {
        const router = this.injector.get(Router);
        void router.navigateByUrl('/login');
      } catch {
        // Fallback in environments without Router
      }
      return false;
    } finally {
      this.isRenewingSession = false;
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
