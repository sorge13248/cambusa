import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ApiService } from './api.service.js';
import { AuthService } from './auth.service.js';
import { ConfirmModalComponent } from '../shared/components/confirm-modal/confirm-modal.component.js';

describe('AuthService', () => {
  let service: AuthService;
  let api: ApiService;
  let dialog: Dialog;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        ApiService,
        provideHttpClient(),
        {
          provide: Dialog,
          useValue: {
            open: vi.fn().mockReturnValue({ closed: of(true) }),
          },
        },
      ],
    });
    service = TestBed.inject(AuthService);
    api = TestBed.inject(ApiService);
    dialog = TestBed.inject(Dialog);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    service.stopSessionPing();
  });

  it('should initialize with null state', () => {
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.households().length).toBe(0);
    expect(service.activeHousehold()).toBeNull();
  });

  it('should switch active household and update localStorage', () => {
    service.households.set([
      { id: 'hh-1', name: 'Main Home', role: 'owner', isOwner: true, memberCount: 2 },
      { id: 'hh-2', name: 'Beach House', role: 'member', isOwner: false, memberCount: 1 },
    ]);

    service.switchHousehold('hh-1');
    expect(service.activeHouseholdId()).toBe('hh-1');
    expect(service.activeHousehold()?.name).toBe('Main Home');
    expect(localStorage.getItem('cambusa_active_household')).toBe('hh-1');
    expect(api.activeHouseholdId()).toBe('hh-1');

    service.switchHousehold('hh-2');
    expect(service.activeHouseholdId()).toBe('hh-2');
    expect(service.activeHousehold()?.name).toBe('Beach House');
    expect(localStorage.getItem('cambusa_active_household')).toBe('hh-2');

    service.switchHousehold(null);
    expect(service.activeHouseholdId()).toBeNull();
    expect(service.activeHousehold()).toBeNull();
    expect(localStorage.getItem('cambusa_active_household')).toBeNull();
  });

  it('should perform silentRefresh successfully via api.refresh and update user profile', async () => {
    const mockUser = {
      id: 'u1',
      email: 'user@example.com',
      displayName: 'User One',
      pictureUrl: null,
    };
    vi.spyOn(api, 'refresh').mockResolvedValue({ refreshed: true, expiresIn: 3600 });
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: mockUser,
      households: [{ id: 'hh-1', name: 'Home', role: 'owner', isOwner: true, memberCount: 1 }],
      activeHouseholdId: 'hh-1',
      pendingInvitationsCount: 0,
    });

    const refreshed = await service.silentRefresh();
    expect(refreshed).toBe(true);
    expect(service.currentUser()?.displayName).toBe('User One');
  });

  it('should delegate to renewSession on handleSessionExpired', async () => {
    const renewSpy = vi.spyOn(service, 'renewSession').mockResolvedValue(true);
    service.currentUser.set({
      id: 'u1',
      email: 'u1@example.com',
      displayName: 'Test',
      pictureUrl: null,
    });

    service.handleSessionExpired();

    expect(service.currentUser()).toBeNull();
    expect(renewSpy).toHaveBeenCalledTimes(1);
  });

  it('should load cached user from localStorage on instantiation and persist on setCachedUser', () => {
    service.setCachedUser({
      id: 'u-cached',
      displayName: 'Cached User',
      pictureUrl: 'https://avatar.example.com/pic.webp',
      email: null,
    });

    expect(service.hasCachedUser()).toBe(true);
    const cached = service.getCachedUser();
    expect(cached?.displayName).toBe('Cached User');
    expect(cached?.pictureUrl).toBe('https://avatar.example.com/pic.webp');

    service.setCachedUser(null);
    expect(service.hasCachedUser()).toBe(false);
    expect(service.getCachedUser()).toBeNull();
  });

  it('should perform transparent silent refresh during init if getMe fails with expired token', async () => {
    const mockUser = {
      id: 'u1',
      email: 'user@example.com',
      displayName: 'User One',
      pictureUrl: null,
    };

    // First getMe fails with 401 (expired token), but silentRefresh succeeds, second getMe succeeds
    vi.spyOn(api, 'getMe')
      .mockRejectedValueOnce(new Error('Token expired'))
      .mockResolvedValueOnce({
        user: mockUser,
        households: [{ id: 'hh-1', name: 'Home', role: 'owner', isOwner: true, memberCount: 1 }],
        activeHouseholdId: 'hh-1',
        pendingInvitationsCount: 0,
      });

    const refreshSpy = vi.spyOn(service, 'silentRefresh').mockResolvedValue(true);

    await service.init();

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(service.currentUser()?.displayName).toBe('User One');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should remember and consume return URL properly', () => {
    service.rememberCurrentUrl();
    const returnUrl = service.consumeReturnUrl();
    expect(service.consumeReturnUrl()).toBeNull(); // consumed once
  });

  it('should compute displayName, pictureUrl, and initials accurately from currentUser', () => {
    expect(service.displayName()).toBe('');
    expect(service.pictureUrl()).toBeNull();
    expect(service.initials()).toBe('C');

    service.currentUser.set({
      id: 'u1',
      email: 'mario@example.com',
      displayName: 'Mario Rossi',
      pictureUrl: 'https://avatar.example.com/photo.webp',
    });

    expect(service.displayName()).toBe('Mario Rossi');
    expect(service.pictureUrl()).toBe('https://avatar.example.com/photo.webp');
    expect(service.initials()).toBe('MR');

    service.currentUser.set({
      id: 'u2',
      email: 'single@example.com',
      displayName: 'Single',
      pictureUrl: null,
    });

    expect(service.displayName()).toBe('Single');
    expect(service.pictureUrl()).toBeNull();
    expect(service.initials()).toBe('S');
  });
});
