import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot } from '@angular/router';
import { authGuard, guestGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

describe('Auth Guards', () => {
  let authServiceMock: {
    isLoading: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
    init: ReturnType<typeof vi.fn>;
  };
  let routerMock: {
    createUrlTree: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authServiceMock = {
      isLoading: vi.fn().mockReturnValue(false),
      isAuthenticated: vi.fn().mockReturnValue(false),
      init: vi.fn().mockResolvedValue(undefined),
    };
    routerMock = {
      createUrlTree: vi.fn().mockImplementation((path, extras) => ({ path, extras })),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  describe('authGuard', () => {
    it('redirects unauthenticated users to /login', async () => {
      authServiceMock.isAuthenticated.mockReturnValue(false);
      const state = { url: '/pantry' } as RouterStateSnapshot;

      const result = await TestBed.runInInjectionContext(() => authGuard({} as any, state));
      expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/pantry' },
      });
      expect(result).toEqual({ path: ['/login'], extras: { queryParams: { returnUrl: '/pantry' } } });
    });

    it('allows access for authenticated users', async () => {
      authServiceMock.isAuthenticated.mockReturnValue(true);
      const state = { url: '/pantry' } as RouterStateSnapshot;

      const result = await TestBed.runInInjectionContext(() => authGuard({} as any, state));
      expect(result).toBe(true);
    });
  });

  describe('guestGuard', () => {
    it('allows unauthenticated users to visit /login', async () => {
      authServiceMock.isAuthenticated.mockReturnValue(false);

      const result = await TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('redirects authenticated users away from /login to /home', async () => {
      authServiceMock.isAuthenticated.mockReturnValue(true);

      const result = await TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));
      expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/home']);
      expect(result).toEqual({ path: ['/home'], extras: undefined });
    });
  });
});
