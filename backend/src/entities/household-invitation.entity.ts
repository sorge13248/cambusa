import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Household } from './household.entity.js';
import { User } from './user.entity.js';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

@Entity({ name: 'household_invitations' })
@Unique(['token'])
@Index(['householdId'])
@Index(['email'])
export class HouseholdInvitation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  householdId!: string;

  @ManyToOne(() => Household, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'householdId' })
  household?: Household;

  @Column({ type: 'varchar' })
  email!: string;

  @Column({ type: 'varchar' })
  invitedById!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invitedById' })
  invitedBy?: User;

  @Column({ type: 'varchar', default: 'pending' })
  status!: InvitationStatus;

  @Column({ type: 'varchar' })
  token!: string;

  @Column({ type: 'datetime' })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
