import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Household } from './household.entity.js';
import { User } from './user.entity.js';

export type HouseholdRole = 'owner' | 'admin' | 'member';

@Entity({ name: 'household_members' })
@Unique(['householdId', 'userId'])
@Index(['householdId'])
@Index(['userId'])
export class HouseholdMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  householdId!: string;

  @ManyToOne(() => Household, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'householdId' })
  household?: Household;

  @Column({ type: 'varchar' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', default: 'member' })
  role!: HouseholdRole;

  @CreateDateColumn()
  createdAt!: Date;
}
