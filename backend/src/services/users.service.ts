import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../common/auth/auth.types.js';
import { Household, HouseholdMember, User } from '../entities/index.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Household)
    private readonly householdsRepository: Repository<Household>,
    @InjectRepository(HouseholdMember)
    private readonly householdMembersRepository: Repository<HouseholdMember>,
  ) {}

  async ensureUser(transient: AuthUser): Promise<User> {
    let user = await this.usersRepository.findOne({
      where: [{ subject: transient.subject }, ...(transient.email ? [{ email: transient.email }] : [])],
    });

    if (!user) {
      user = this.usersRepository.create({
        subject: transient.subject,
        email: transient.email,
        displayName: transient.displayName,
        pictureUrl: transient.pictureUrl,
      });
      user = await this.usersRepository.save(user);
    } else {
      let modified = false;
      if (transient.displayName && user.displayName !== transient.displayName) {
        user.displayName = transient.displayName;
        modified = true;
      }
      if (transient.pictureUrl && user.pictureUrl !== transient.pictureUrl) {
        user.pictureUrl = transient.pictureUrl;
        modified = true;
      }
      if (transient.email && user.email !== transient.email) {
        user.email = transient.email;
        modified = true;
      }
      if (modified) {
        user = await this.usersRepository.save(user);
      }
    }

    // Ensure the user has at least one household
    const existingMembership = await this.householdMembersRepository.findOne({
      where: { userId: user.id },
    });

    if (!existingMembership) {
      const defaultHousehold = this.householdsRepository.create({
        name: 'My Home',
        ownerId: user.id,
      });
      const savedHousehold = await this.householdsRepository.save(defaultHousehold);

      const ownerMember = this.householdMembersRepository.create({
        householdId: savedHousehold.id,
        userId: user.id,
        role: 'owner',
      });
      await this.householdMembersRepository.save(ownerMember);
    }

    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }
}
