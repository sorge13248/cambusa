import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { Household, HouseholdInvitation, HouseholdMember, User } from '../entities/index.js';

export interface UserHouseholdSummary {
  id: string;
  name: string;
  role: string;
  isOwner: boolean;
  memberCount: number;
}

@Injectable()
export class HouseholdsService {
  constructor(
    @InjectRepository(Household)
    private readonly householdsRepository: Repository<Household>,
    @InjectRepository(HouseholdMember)
    private readonly membersRepository: Repository<HouseholdMember>,
    @InjectRepository(HouseholdInvitation)
    private readonly invitationsRepository: Repository<HouseholdInvitation>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async getUserHouseholds(userId: string): Promise<UserHouseholdSummary[]> {
    const memberships = await this.membersRepository.find({
      where: { userId },
    });

    if (memberships.length === 0) {
      return [];
    }

    const summaries: UserHouseholdSummary[] = [];

    for (const membership of memberships) {
      const household = await this.householdsRepository.findOne({
        where: { id: membership.householdId },
      });
      if (!household) continue;

      const memberCount = await this.membersRepository.count({
        where: { householdId: household.id },
      });

      summaries.push({
        id: household.id,
        name: household.name,
        role: membership.role,
        isOwner: membership.role === 'owner' || household.ownerId === userId,
        memberCount,
      });
    }

    return summaries;
  }

  async verifyMembership(householdId: string, userId: string): Promise<HouseholdMember | null> {
    return this.membersRepository.findOne({
      where: { householdId, userId },
    });
  }

  async getHousehold(householdId: string): Promise<Household | null> {
    return this.householdsRepository.findOne({ where: { id: householdId } });
  }

  async getDefaultHousehold(userId: string): Promise<Household | null> {
    const membership = await this.membersRepository.findOne({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    if (!membership) return null;
    return this.householdsRepository.findOne({ where: { id: membership.householdId } });
  }

  async createHousehold(userId: string, name: string): Promise<Household> {
    if (!name?.trim()) {
      throw new BadRequestException('Household name is required');
    }

    const household = this.householdsRepository.create({
      name: name.trim(),
      ownerId: userId,
    });
    const saved = await this.householdsRepository.save(household);

    const member = this.membersRepository.create({
      householdId: saved.id,
      userId,
      role: 'owner',
    });
    await this.membersRepository.save(member);

    return saved;
  }

  async updateHousehold(householdId: string, userId: string, name: string): Promise<Household> {
    const household = await this.householdsRepository.findOne({ where: { id: householdId } });
    if (!household) throw new NotFoundException('Household not found');

    const membership = await this.verifyMembership(householdId, userId);
    if (!membership || (household.ownerId !== userId && membership.role !== 'owner')) {
      throw new ForbiddenException('Only the household owner can rename this household');
    }

    household.name = name.trim();
    return this.householdsRepository.save(household);
  }

  async deleteHousehold(householdId: string, userId: string): Promise<void> {
    const household = await this.householdsRepository.findOne({ where: { id: householdId } });
    if (!household) throw new NotFoundException('Household not found');

    const membership = await this.verifyMembership(householdId, userId);
    if (!membership || (household.ownerId !== userId && membership.role !== 'owner')) {
      throw new ForbiddenException('Only the household owner can delete this household');
    }

    await this.invitationsRepository.delete({ householdId });
    await this.membersRepository.delete({ householdId });
    await this.householdsRepository.delete({ id: householdId });
  }

  async getMembers(householdId: string, userId: string) {
    const membership = await this.verifyMembership(householdId, userId);
    if (!membership) {
      throw new ForbiddenException('Not a member of this household');
    }

    const members = await this.membersRepository.find({
      where: { householdId },
    });

    const result = [];
    for (const m of members) {
      const u = await this.usersRepository.findOne({ where: { id: m.userId } });
      result.push({
        id: m.id,
        userId: m.userId,
        role: m.role,
        displayName: u?.displayName ?? 'Unknown',
        email: u?.email ?? null,
        pictureUrl: u?.pictureUrl ?? null,
        joinedAt: m.createdAt,
      });
    }

    return result;
  }

  async sendInvitation(householdId: string, inviterUserId: string, email: string): Promise<HouseholdInvitation> {
    const membership = await this.verifyMembership(householdId, inviterUserId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw new ForbiddenException('Only owners or admins can invite new members');
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Valid email is required');
    }

    // Check if target user is already a member
    const targetUser = await this.usersRepository.findOne({ where: { email: normalizedEmail } });
    if (targetUser) {
      const existing = await this.membersRepository.findOne({
        where: { householdId, userId: targetUser.id },
      });
      if (existing) {
        throw new BadRequestException('User is already a member of this household');
      }
    }

    // Check existing pending invitation
    const existingInvite = await this.invitationsRepository.findOne({
      where: { householdId, email: normalizedEmail, status: 'pending' },
    });
    if (existingInvite) {
      return existingInvite;
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = this.invitationsRepository.create({
      householdId,
      email: normalizedEmail,
      invitedById: inviterUserId,
      token,
      status: 'pending',
      expiresAt,
    });

    return this.invitationsRepository.save(invitation);
  }

  async getPendingInvitationsSent(householdId: string, userId: string): Promise<HouseholdInvitation[]> {
    const membership = await this.verifyMembership(householdId, userId);
    if (!membership) {
      throw new ForbiddenException('Not a member of this household');
    }

    return this.invitationsRepository.find({
      where: { householdId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeInvitation(invitationId: string, householdId: string, userId: string): Promise<void> {
    const membership = await this.verifyMembership(householdId, userId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw new ForbiddenException('Only owners or admins can revoke invitations');
    }

    const invite = await this.invitationsRepository.findOne({
      where: { id: invitationId, householdId },
    });
    if (!invite) throw new NotFoundException('Invitation not found');

    invite.status = 'revoked';
    await this.invitationsRepository.save(invite);
  }

  async getPendingInvitationsForEmail(email: string | null) {
    if (!email) return [];
    const normalized = email.trim().toLowerCase();

    const invitations = await this.invitationsRepository.find({
      where: { email: normalized, status: 'pending' },
      order: { createdAt: 'DESC' },
    });

    const result = [];
    for (const inv of invitations) {
      const hh = await this.householdsRepository.findOne({ where: { id: inv.householdId } });
      const inviter = await this.usersRepository.findOne({ where: { id: inv.invitedById } });
      result.push({
        id: inv.id,
        householdId: inv.householdId,
        householdName: hh?.name ?? 'Unknown Household',
        inviterName: inviter?.displayName ?? 'A Cambusa user',
        inviterEmail: inviter?.email ?? null,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      });
    }

    return result;
  }

  async respondToInvitation(invitationId: string, user: User, accept: boolean): Promise<{ success: boolean; householdId?: string }> {
    const invite = await this.invitationsRepository.findOne({
      where: { id: invitationId, status: 'pending' },
    });
    if (!invite) throw new NotFoundException('Invitation not found or no longer pending');

    if (user.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }

    if (!accept) {
      invite.status = 'declined';
      await this.invitationsRepository.save(invite);
      return { success: true };
    }

    invite.status = 'accepted';
    await this.invitationsRepository.save(invite);

    const existingMember = await this.membersRepository.findOne({
      where: { householdId: invite.householdId, userId: user.id },
    });

    if (!existingMember) {
      const member = this.membersRepository.create({
        householdId: invite.householdId,
        userId: user.id,
        role: 'member',
      });
      await this.membersRepository.save(member);
    }

    return { success: true, householdId: invite.householdId };
  }
}
