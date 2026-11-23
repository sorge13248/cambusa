import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Household } from './household.entity.js';
import { Product } from './product.entity.js';
import { Location } from './location.entity.js';

@Entity({ name: 'stock_items' })
@Index(['householdId'])
@Index(['householdId', 'productId'])
@Index(['householdId', 'bestBeforeDate'])
@Index(['householdId', 'locationId'])
export class StockItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  householdId!: string;

  @ManyToOne(() => Household, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'householdId' })
  household?: Household;

  @Column({ type: 'varchar' })
  productId!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column({ type: 'real' })
  amount!: number;

  @Column({ type: 'varchar', nullable: true })
  bestBeforeDate!: string | null;

  @Column({ type: 'varchar', nullable: true })
  purchasedDate!: string | null;

  @Column({ type: 'real', nullable: true })
  price!: number | null;

  @Column({ type: 'varchar', nullable: true })
  locationId!: string | null;

  @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'locationId' })
  location?: Location | null;

  @Column({ type: 'boolean', default: false })
  isOpen!: boolean;

  @Column({ type: 'varchar', nullable: true })
  openedDate!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
