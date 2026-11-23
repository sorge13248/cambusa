import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog } from '@angular/cdk/dialog';
import { authInterceptor } from './auth.interceptor.js';
import { AuthService } from './auth.service.js';
import { ApiService } from './api.service.js';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: ApiService,
          useValue: {
            getMe: vi.fn().mockResolvedValue({ user: null, households: [], pendingInvitationsCount: 0 }),
            refresh: vi.fn().mockResolvedValue({ refreshed: false }),
            logout: vi.fn().mockResolvedValue({ loggedOut: true }),
          },
        },
        {
          provide: Dialog,
          useValue: {
            open: vi.fn(),
          },
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    authService.stopSessionPing();
    const pending = httpTesting.match(() => true);
    pending.forEach((req) => req.flush(null));
    httpTesting.verify();
  });

  it('should attach withCredentials to /api requests', () => {
    http.get('/api/test').subscribe();
    const req = httpTesting.expectOne('/api/test');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('should not modify non-/api requests', () => {
    http.get('https://example.com/external').subscribe();
    const req = httpTesting.expectOne('https://example.com/external');
    expect(req.request.withCredentials).toBe(false);
    req.flush({});
  });

  it('should attempt silent refresh and retry when authenticated and 401 is received', async () => {
    authService.currentUser.set({
      id: 'u1',
      email: 'user@example.com',
      displayName: 'User 1',
      pictureUrl: null,
    });

    const refreshSpy = vi.spyOn(authService, 'silentRefresh').mockResolvedValue(true);

    let result: any = null;
    http.get('/api/stock').subscribe((res) => {
      result = res;
    });

    // First request fails with 401
    const req1 = httpTesting.expectOne('/api/stock');
    req1.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    await Promise.resolve();
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    // Retried request succeeds
    const req2 = httpTesting.expectOne('/api/stock');
    req2.flush({ data: 'ok' });

    expect(result).toEqual({ data: 'ok' });
  });

  it('should call handleSessionExpired when authenticated and silent refresh fails on 401', async () => {
    authService.currentUser.set({
      id: 'u1',
      email: 'user@example.com',
      displayName: 'User 1',
      pictureUrl: null,
    });

    vi.spyOn(authService, 'silentRefresh').mockResolvedValue(false);
    const expiredSpy = vi.spyOn(authService, 'handleSessionExpired').mockImplementation(() => {});

    let errorReceived: any = null;
    http.get('/api/stock').subscribe({
      error: (err) => {
        errorReceived = err;
      },
    });

    const req = httpTesting.expectOne('/api/stock');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    await Promise.resolve();
    expect(expiredSpy).toHaveBeenCalledTimes(1);
    expect(errorReceived).toBeTruthy();
  });

  it('should not attempt refresh when unauthenticated and 401 is received', () => {
    const refreshSpy = vi.spyOn(authService, 'silentRefresh');
    const expiredSpy = vi.spyOn(authService, 'handleSessionExpired');

    expect(authService.isAuthenticated()).toBe(false);

    let errorReceived: any = null;
    http.get('/api/stock').subscribe({
      error: (err) => {
        errorReceived = err;
      },
    });

    const req = httpTesting.expectOne('/api/stock');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(expiredSpy).not.toHaveBeenCalled();
    expect(errorReceived).toBeTruthy();
  });
});
