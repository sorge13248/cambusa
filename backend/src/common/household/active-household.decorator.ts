import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ActiveHousehold = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ activeHouseholdId?: string }>();
    return request.activeHouseholdId ?? '';
  },
);
