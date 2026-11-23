import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Household } from './household.entity.js';

@Entity({ name: 'sync_tombstones' })
@Index(['householdId'])
@Index(['householdId', 'entityType'])
@Index(['householdId', 'deletedAt'])
export class SyncTombstone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  householdId!: string;

  @ManyToOne(() => Household, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'householdId' })
  household?: Household;

  @Column({ type: 'varchar' })
  entityType!: string;

  @Column({ type: 'varchar' })
  entityId!: string;

  @CreateDateColumn()
  deletedAt!: Date;
}
