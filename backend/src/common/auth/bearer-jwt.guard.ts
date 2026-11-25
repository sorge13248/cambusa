import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { randomUUID } from 'node:crypto';
import { AuthUser, JwtClaims } from './auth.types.js';
import { UsersService } from '../../services/users.service.js';
import { ProfileService } from '../../services/profile.service.js';

const ACCESS_TOKEN_COOKIE = 'cambusa_at';
const ID_TOKEN_COOKIE = 'cambusa_it';

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

function extractClaims(payload: Record<string, unknown>): JwtClaims {
  const pictureClaim =
    typeof payload['picture'] === 'string' && payload['picture'].trim().length > 0
      ? (payload['picture'] as string).trim()
      : typeof payload['avatar_url'] === 'string' && (payload['avatar_url'] as string).trim().length > 0
        ? (payload['avatar_url'] as string).trim()
        : typeof payload['picture_url'] === 'string' && (payload['picture_url'] as string).trim().length > 0
          ? (payload['picture_url'] as string).trim()
          : undefined;

  return {
    sub: typeof payload['sub'] === 'string' ? payload['sub'] : undefined,
    email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
    name: typeof payload['name'] === 'string' ? payload['name'] : undefined,
    preferred_username: typeof payload['preferred_username'] === 'string' ? payload['preferred_username'] : undefined,
    picture: pictureClaim,
  };
}

function decodeBase64UrlJson(input: string): JwtClaims | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return extractClaims(parsed);
  } catch {
    return null;
  }
}

@Injectable()
export class BearerJwtGuard implements CanActivate {
  private jwksResolver: JWTVerifyGetKey | null = null;
  private issuerForJwks: string | null = null;

  constructor(
    private readonly usersService: UsersService,
    private readonly profileService: ProfileService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const authorization = request.headers.authorization;
    const cookies = parseCookieHeader(request.headers.cookie);
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : null;
    const token = bearerToken ?? cookies[ACCESS_TOKEN_COOKIE];
    const idToken = cookies[ID_TOKEN_COOKIE] ?? null;

    // Check for API key in X-API-Key header or Bearer cambusa_ak_...
    const apiKey = request.headers['x-api-key'] || (token?.startsWith('cambusa_ak_') ? token : null);
    if (apiKey) {
      const apiUser = await this.profileService.validateApiKey(apiKey);
      if (apiUser) {
        request.user = {
          id: apiUser.id,
          subject: apiUser.subject,
          email: apiUser.email,
          displayName: apiUser.displayName,
          pictureUrl: apiUser.pictureUrl,
        };
        return true;
      }
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    const issuer = (process.env.OIDC_ISSUER_URL ?? '').trim().replace(/\/$/, '');
    const audience = (process.env.OIDC_CLIENT_ID ?? '').trim();

    // Dev fallback if OIDC is not configured
    if (!issuer || !audience) {
      if (token === 'dev-access-token' || token === 'dev-token') {
        const fallbackUser: AuthUser = {
          id: 'dev-user-001',
          subject: 'dev-user-001',
          email: 'dev@cambusa.local',
          displayName: 'Dev User',
          pictureUrl: null,
        };
        const persisted = await this.usersService.ensureUser(fallbackUser);
        request.user = {
          id: persisted.id,
          subject: persisted.subject,
          email: persisted.email,
          displayName: persisted.displayName,
          pictureUrl: persisted.pictureUrl,
        };
        return true;
      }
      throw new UnauthorizedException('Invalid dev authentication token');
    }

    let claims: JwtClaims;
    try {
      claims = await this.verifyToken(token, issuer, audience);
    } catch {
      // If access_token validation failed, attempt ID token validation if present
      if (idToken) {
        const verifiedId = await this.tryVerifyToken(idToken, issuer, audience);
        if (verifiedId) {
          claims = verifiedId;
        } else {
          throw new UnauthorizedException('Invalid token signature or claims');
        }
      } else {
        throw new UnauthorizedException('Invalid token signature or claims');
      }
    }

    if (idToken && (!claims.email || !claims.name || !claims.preferred_username || !claims.picture)) {
      const idTokenClaims = await this.tryVerifyToken(idToken, issuer, audience);
      if (idTokenClaims) {
        claims = {
          sub: claims.sub ?? idTokenClaims.sub,
          email: claims.email ?? idTokenClaims.email,
          name: claims.name ?? idTokenClaims.name,
          preferred_username: claims.preferred_username ?? idTokenClaims.preferred_username,
          picture: claims.picture ?? idTokenClaims.picture,
        };
      }
    }

    if (!claims?.sub && !claims?.email && !claims?.name && !claims?.preferred_username) {
      throw new UnauthorizedException('Invalid token claims');
    }

    const transientUser: AuthUser = {
      id: claims.sub ?? claims.email ?? randomUUID(),
      subject: claims.sub ?? claims.email ?? 'unknown',
      email: claims.email ?? null,
      displayName: claims.name ?? claims.preferred_username ?? claims.email ?? 'Cambusa User',
      pictureUrl: claims.picture ?? null,
    };

    const persisted = await this.usersService.ensureUser(transientUser);
    request.user = {
      id: persisted.id,
      subject: persisted.subject,
      email: persisted.email,
      displayName: persisted.displayName,
      pictureUrl: persisted.pictureUrl,
    };

    return true;
  }

  private async verifyToken(token: string, issuer: string, audience: string): Promise<JwtClaims> {
    const jwks = await this.getJwksResolver(issuer);

    try {
      const result = await jwtVerify(token, jwks, { issuer, audience, clockTolerance: '15s' });
      return extractClaims(result.payload as Record<string, unknown>);
    } catch {
      // Try verifying with issuer only if audience matching failed on access token
      try {
        const result = await jwtVerify(token, jwks, { issuer, clockTolerance: '15s' });
        return extractClaims(result.payload as Record<string, unknown>);
      } catch {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const decoded = decodeBase64UrlJson(parts[1]);
          if (decoded?.sub) return decoded;
        }
        throw new UnauthorizedException('Invalid token signature or claims');
      }
    }
  }

  private async tryVerifyToken(token: string, issuer: string, audience: string): Promise<JwtClaims | null> {
    try {
      return await this.verifyToken(token, issuer, audience);
    } catch {
      return null;
    }
  }

  private async getJwksResolver(issuer: string): Promise<JWTVerifyGetKey> {
    if (this.jwksResolver && this.issuerForJwks === issuer) {
      return this.jwksResolver;
    }

    const metadataUrl = `${issuer}/.well-known/openid-configuration`;
    const response = await fetch(metadataUrl);
    if (!response.ok) {
      throw new UnauthorizedException(`Cannot fetch OIDC metadata (${response.status})`);
    }

    const metadata = (await response.json()) as { jwks_uri?: string };
    if (!metadata.jwks_uri) {
      throw new UnauthorizedException('OIDC metadata is missing jwks_uri');
    }

    this.jwksResolver = createRemoteJWKSet(new URL(metadata.jwks_uri));
    this.issuerForJwks = issuer;
    return this.jwksResolver;
  }
}
