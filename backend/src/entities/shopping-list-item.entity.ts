import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Household } from './household.entity.js';
import { ShoppingList } from './shopping-list.entity.js';
import { Product } from './product.entity.js';
import { Store } from './store.entity.js';
import { QuantityUnit } from './quantity-unit.entity.js';

@Entity({ name: 'shopping_list_items' })
@Index(['householdId'])
@Index(['householdId', 'shoppingListId'])
@Index(['householdId', 'productId'])
@Index(['householdId', 'storeId'])
export class ShoppingListItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  householdId!: string;

  @ManyToOne(() => Household, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'householdId' })
  household?: Household;

  @Column({ type: 'varchar' })
  shoppingListId!: string;

  @ManyToOne(() => ShoppingList, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shoppingListId' })
  shoppingList?: ShoppingList;

  @Column({ type: 'varchar', nullable: true })
  productId!: string | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product?: Product | null;

  @Column({ type: 'varchar', nullable: true })
  customName!: string | null;

  @Column({ type: 'real', default: 1 })
  amount!: number;

  @Column({ type: 'varchar', nullable: true })
  quId!: string | null;

  @ManyToOne(() => QuantityUnit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'quId' })
  qu?: QuantityUnit | null;

  @Column({ type: 'varchar', nullable: true })
  storeId!: string | null;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'storeId' })
  store?: Store | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: false })
  done!: boolean;

  @Column({ type: 'datetime', nullable: true })
  doneAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
