import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Household } from './household.entity.js';

@Entity({ name: 'stores' })
@Unique(['householdId', 'name'])
@Index(['householdId'])
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  householdId!: string;

  @ManyToOne(() => Household, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'householdId' })
  household?: Household;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
