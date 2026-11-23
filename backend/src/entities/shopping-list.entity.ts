import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Household } from './household.entity.js';
import { Store } from './store.entity.js';

@Entity({ name: 'shopping_lists' })
@Index(['householdId'])
@Index(['householdId', 'storeId'])
export class ShoppingList {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  householdId!: string;

  @ManyToOne(() => Household, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'householdId' })
  household?: Household;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  storeId!: string | null;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'storeId' })
  store?: Store | null;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
