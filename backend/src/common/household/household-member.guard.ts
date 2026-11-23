import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types.js';
import { HouseholdsService } from '../../services/households.service.js';

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

@Injectable()
export class HouseholdMemberGuard implements CanActivate {
  constructor(private readonly householdsService: HouseholdsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      query?: Record<string, string | undefined>;
      user?: AuthUser;
      activeHouseholdId?: string;
    }>();

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User must be authenticated before selecting household');
    }

    const cookies = parseCookieHeader(request.headers.cookie);
    const headerHouseholdId = request.headers['x-household-id'];
    const queryHouseholdId = request.query?.householdId;
    const cookieHouseholdId = cookies['cambusa_household_id'];

    let targetHouseholdId = headerHouseholdId || queryHouseholdId || cookieHouseholdId;

    if (!targetHouseholdId) {
      // Fallback to user's first/default household
      const defaultHousehold = await this.householdsService.getDefaultHousehold(user.id);
      if (!defaultHousehold) {
        throw new ForbiddenException('User does not belong to any household');
      }
      targetHouseholdId = defaultHousehold.id;
    }

    const membership = await this.householdsService.verifyMembership(targetHouseholdId, user.id);
    if (!membership) {
      throw new ForbiddenException(`Access denied to household ${targetHouseholdId}`);
    }

    request.activeHouseholdId = targetHouseholdId;
    return true;
  }
}
