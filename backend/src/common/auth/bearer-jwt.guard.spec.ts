import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BearerJwtGuard } from './bearer-jwt.guard.js';

describe('BearerJwtGuard', () => {
  let guard: BearerJwtGuard;
  let mockUsersService: any;
  let mockProfileService: any;

  beforeEach(() => {
    mockUsersService = {
      ensureUser: vi.fn().mockImplementation((user) => Promise.resolve({ ...user, id: 'persisted-uuid' })),
    };
    mockProfileService = {
      validateApiKey: vi.fn().mockResolvedValue(null),
    };
    guard = new BearerJwtGuard(mockUsersService, mockProfileService);
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.OIDC_CLIENT_ID;
  });

  function createMockContext(headers: Record<string, string | undefined> = {}) {
    const request = { headers, user: undefined as any };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      request,
    };
  }

  it('throws UnauthorizedException when no token or cookie is present', async () => {
    const { switchToHttp } = createMockContext();
    await expect(guard.canActivate({ switchToHttp } as ExecutionContext)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException in dev mode if token is invalid', async () => {
    const { switchToHttp } = createMockContext({
      authorization: 'Bearer bad-token',
    });
    await expect(guard.canActivate({ switchToHttp } as ExecutionContext)).rejects.toThrow(UnauthorizedException);
  });

  it('allows access in dev mode with dev-access-token and sets request.user', async () => {
    const context = createMockContext({
      cookie: 'cambusa_at=dev-access-token',
    });
    const result = await guard.canActivate(context as unknown as ExecutionContext);
    expect(result).toBe(true);
    expect(context.request.user).toBeDefined();
    expect(context.request.user.email).toBe('dev@cambusa.local');
  });

  it('authenticates successfully with valid X-API-Key header', async () => {
    mockProfileService.validateApiKey.mockResolvedValue({
      id: 'user-api-1',
      subject: 'sub-api-1',
      email: 'api@example.com',
      displayName: 'API User',
      pictureUrl: null,
    });

    const context = createMockContext({
      'x-api-key': 'cambusa_ak_valid123',
    });

    const result = await guard.canActivate(context as unknown as ExecutionContext);
    expect(result).toBe(true);
    expect(context.request.user).toBeDefined();
    expect(context.request.user.id).toBe('user-api-1');
    expect(context.request.user.displayName).toBe('API User');
  });

  it('rejects with UnauthorizedException on invalid API key', async () => {
    mockProfileService.validateApiKey.mockResolvedValue(null);

    const context = createMockContext({
      'x-api-key': 'cambusa_ak_invalid',
    });

    await expect(guard.canActivate(context as unknown as ExecutionContext)).rejects.toThrow(UnauthorizedException);
  });

  it('enriches pictureUrl from ID token when access token omits picture', async () => {
    process.env.OIDC_ISSUER_URL = 'https://auth.example.com';
    process.env.OIDC_CLIENT_ID = 'cambusa';

    vi.spyOn(guard as any, 'verifyToken').mockResolvedValue({
      sub: 'user-oidc-1',
      email: 'oidc@example.com',
      name: 'OIDC User',
      preferred_username: 'oidcuser',
    });

    vi.spyOn(guard as any, 'tryVerifyToken').mockResolvedValue({
      sub: 'user-oidc-1',
      picture: 'https://images.example.com/avatar.jpg',
    });

    const context = createMockContext({
      cookie: 'cambusa_at=access-token; cambusa_it=id-token',
    });

    const result = await guard.canActivate(context as unknown as ExecutionContext);
    expect(result).toBe(true);
    expect(mockUsersService.ensureUser).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'user-oidc-1',
        displayName: 'OIDC User',
        pictureUrl: 'https://images.example.com/avatar.jpg',
      }),
    );
    expect(context.request.user.pictureUrl).toBe('https://images.example.com/avatar.jpg');
  });

  it('reads picture claim directly from access token when present', async () => {
    process.env.OIDC_ISSUER_URL = 'https://auth.example.com';
    process.env.OIDC_CLIENT_ID = 'cambusa';

    vi.spyOn(guard as any, 'verifyToken').mockResolvedValue({
      sub: 'user-oidc-2',
      email: 'user2@example.com',
      name: 'User Two',
      preferred_username: 'user2',
      picture: 'https://images.example.com/direct-avatar.webp',
    });

    const context = createMockContext({
      authorization: 'Bearer valid-jwt-token',
    });

    const result = await guard.canActivate(context as unknown as ExecutionContext);
    expect(result).toBe(true);
    expect(context.request.user.pictureUrl).toBe('https://images.example.com/direct-avatar.webp');
  });
});
