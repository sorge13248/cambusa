import { Controller, Get, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuthUser } from '../common/auth/auth.types.js';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { HouseholdsService } from '../services/households.service.js';

interface OidcMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface HttpRequest {
  headers: Record<string, string | undefined>;
}

interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  maxAge?: number;
}

interface HttpResponse {
  cookie(name: string, value: string, options?: CookieOptions): void;
  clearCookie(name: string, options?: CookieOptions): void;
  redirect(statusOrUrl: number | string, maybeUrl?: string): void;
}

const COOKIE_ACCESS_TOKEN = 'cambusa_at';
const COOKIE_ID_TOKEN = 'cambusa_it';
const COOKIE_REFRESH_TOKEN = 'cambusa_rt';
const COOKIE_STATE = 'cambusa_oidc_state';
const COOKIE_VERIFIER = 'cambusa_oidc_verifier';
const COOKIE_NONCE = 'cambusa_oidc_nonce';

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const idx = part.indexOf('=');
      if (idx > 0) {
        acc[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
      }
      return acc;
    }, {});
}

function base64UrlEncode(input: Uint8Array): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomString(length = 48): string {
  return base64UrlEncode(randomBytes(length));
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = createHash('sha256').update(verifier).digest();
  return base64UrlEncode(digest);
}

@Controller('auth')
export class AuthController {
  private metadataCache: { value: OidcMetadata; fetchedAt: number } | null = null;

  constructor(private readonly householdsService: HouseholdsService) {}

  @Get('login')
  async login(@Res({ passthrough: true }) response: HttpResponse) {
    const issuer = process.env.OIDC_ISSUER_URL?.trim();
    if (!issuer) {
      // In development when OIDC is not configured, set dev session cookie and redirect to callback
      response.cookie(COOKIE_ACCESS_TOKEN, 'dev-access-token', this.sessionCookieOptions());
      response.cookie(COOKIE_ID_TOKEN, 'dev-id-token', this.sessionCookieOptions());
      response.redirect(this.frontendRedirectUrl('/auth/callback?status=ok'));
      return;
    }

    const metadata = await this.getMetadata();
    const config = this.getOidcConfigOrThrow();

    const state = randomString(24);
    const nonce = randomString(24);
    const verifier = randomString(64);
    const challenge = await codeChallenge(verifier);

    response.cookie(COOKIE_STATE, state, this.pkceCookieOptions());
    response.cookie(COOKIE_NONCE, nonce, this.pkceCookieOptions());
    response.cookie(COOKIE_VERIFIER, verifier, this.pkceCookieOptions());

    const authorize = new URL(metadata.authorization_endpoint);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('client_id', config.clientId);
    authorize.searchParams.set('redirect_uri', config.redirectUri);
    authorize.searchParams.set('scope', 'openid profile email offline_access');
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('nonce', nonce);
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 'S256');

    response.redirect(authorize.toString());
  }

  @Get('callback')
  async callback(
    @Req() request: HttpRequest,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const issuer = process.env.OIDC_ISSUER_URL?.trim();
    if (!issuer) {
      response.redirect(this.frontendRedirectUrl('/auth/callback?status=ok'));
      return;
    }

    try {
      const cookies = parseCookieHeader(request.headers.cookie);
      const expectedState = cookies[COOKIE_STATE];
      const verifier = cookies[COOKIE_VERIFIER];

      if (!code || !state || !expectedState || !verifier || state !== expectedState) {
        throw new UnauthorizedException('Invalid OIDC callback state');
      }

      const metadata = await this.getMetadata();
      const config = this.getOidcConfigOrThrow();

      const tokenResponse = await fetch(metadata.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.redirectUri,
          code_verifier: verifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        throw new UnauthorizedException(`OIDC token exchange failed (${tokenResponse.status}): ${errText}`);
      }

      const tokens = (await tokenResponse.json()) as TokenResponse;
      if (!tokens.access_token) {
        throw new UnauthorizedException('OIDC token response is missing access_token');
      }

      this.clearPkceCookies(response);
      response.cookie(COOKIE_ACCESS_TOKEN, tokens.access_token, this.sessionCookieOptions(tokens.expires_in));

      if (tokens.id_token) {
        response.cookie(COOKIE_ID_TOKEN, tokens.id_token, this.sessionCookieOptions(tokens.expires_in));
      } else {
        response.clearCookie(COOKIE_ID_TOKEN, this.sessionCookieOptions());
      }

      if (tokens.refresh_token) {
        response.cookie(COOKIE_REFRESH_TOKEN, tokens.refresh_token, this.refreshCookieOptions());
      } else {
        response.clearCookie(COOKIE_REFRESH_TOKEN, this.refreshCookieOptions());
      }

      response.redirect(this.frontendRedirectUrl('/auth/callback?status=ok'));
    } catch (err: any) {
      const msg = encodeURIComponent(err?.message || 'Authentication failed');
      response.redirect(this.frontendRedirectUrl(`/auth/callback?error=${msg}`));
    }
  }

  @Post('refresh')
  async refresh(
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const cookies = parseCookieHeader(request.headers.cookie);
    const refreshToken = cookies[COOKIE_REFRESH_TOKEN];

    if (!refreshToken) {
      this.clearSessionCookies(response);
      throw new UnauthorizedException('Missing refresh token');
    }

    const metadata = await this.getMetadata();
    const config = this.getOidcConfigOrThrow();

    const tokenResponse = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      this.clearSessionCookies(response);
      throw new UnauthorizedException(`OIDC refresh token request failed (${tokenResponse.status})`);
    }

    const tokens = (await tokenResponse.json()) as TokenResponse;
    if (!tokens.access_token) {
      this.clearSessionCookies(response);
      throw new UnauthorizedException('OIDC token response is missing access_token');
    }

    response.cookie(COOKIE_ACCESS_TOKEN, tokens.access_token, this.sessionCookieOptions(tokens.expires_in));

    if (tokens.id_token) {
      response.cookie(COOKIE_ID_TOKEN, tokens.id_token, this.sessionCookieOptions(tokens.expires_in));
    }

    const activeRefreshToken = tokens.refresh_token ?? refreshToken;
    response.cookie(COOKIE_REFRESH_TOKEN, activeRefreshToken, this.refreshCookieOptions());

    return { refreshed: true, expiresIn: tokens.expires_in ?? 3600 };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) response: HttpResponse) {
    this.clearPkceCookies(response);
    this.clearSessionCookies(response);
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(BearerJwtGuard)
  async me(@CurrentUser() user: AuthUser) {
    const households = await this.householdsService.getUserHouseholds(user.id);
    const defaultHh = await this.householdsService.getDefaultHousehold(user.id);
    const invitations = await this.householdsService.getPendingInvitationsForEmail(user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
      },
      households,
      activeHouseholdId: defaultHh?.id ?? households[0]?.id ?? null,
      pendingInvitationsCount: invitations.length,
    };
  }

  private pkceCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 10 * 60 * 1000, // 10 minutes
    };
  }

  private sessionCookieOptions(expiresInSeconds = 3600): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: expiresInSeconds * 1000,
    };
  }

  private refreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    };
  }

  private clearPkceCookies(response: HttpResponse) {
    response.clearCookie(COOKIE_STATE, this.pkceCookieOptions());
    response.clearCookie(COOKIE_NONCE, this.pkceCookieOptions());
    response.clearCookie(COOKIE_VERIFIER, this.pkceCookieOptions());
  }

  private clearSessionCookies(response: HttpResponse) {
    response.clearCookie(COOKIE_ACCESS_TOKEN, this.sessionCookieOptions());
    response.clearCookie(COOKIE_ID_TOKEN, this.sessionCookieOptions());
    response.clearCookie(COOKIE_REFRESH_TOKEN, this.refreshCookieOptions());
  }

  private frontendRedirectUrl(path: string): string {
    const base = (process.env.OIDC_FRONTEND_REDIRECT_BASE_URL ?? '').trim().replace(/\/$/, '');
    return `${base}${path}`;
  }

  private getOidcConfigOrThrow() {
    const issuerUrl = (process.env.OIDC_ISSUER_URL ?? '').trim();
    const clientId = (process.env.OIDC_CLIENT_ID ?? '').trim();
    const clientSecret = (process.env.OIDC_CLIENT_SECRET ?? '').trim();
    const redirectUri = (process.env.OIDC_REDIRECT_URI ?? '').trim();

    if (!issuerUrl || !clientId || !redirectUri) {
      throw new UnauthorizedException('OIDC environment variables are not properly configured');
    }

    return { issuerUrl, clientId, clientSecret, redirectUri };
  }

  private async getMetadata(): Promise<OidcMetadata> {
    const now = Date.now();
    if (this.metadataCache && now - this.metadataCache.fetchedAt < 60 * 60 * 1000) {
      return this.metadataCache.value;
    }

    const config = this.getOidcConfigOrThrow();
    const wellKnown = `${config.issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const response = await fetch(wellKnown);
    if (!response.ok) {
      throw new UnauthorizedException(`Failed to fetch OIDC metadata from ${wellKnown} (${response.status})`);
    }

    const payload = (await response.json()) as OidcMetadata;
    if (!payload.authorization_endpoint || !payload.token_endpoint) {
      throw new UnauthorizedException('OIDC metadata is missing critical endpoint definitions');
    }

    this.metadataCache = { value: payload, fetchedAt: now };
    return payload;
  }
}
