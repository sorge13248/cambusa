import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Household } from './household.entity.js';
import { User } from './user.entity.js';

@Entity({ name: 'saved_filters' })
@Unique(['householdId', 'name'])
@Index(['householdId'])
@Index(['householdId', 'userId'])
export class SavedFilter {
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

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'text' })
  filterConfig!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
