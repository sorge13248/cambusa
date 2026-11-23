import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Household } from './household.entity.js';
import { Product } from './product.entity.js';
import { Store } from './store.entity.js';

@Entity({ name: 'product_stores' })
@Unique(['householdId', 'productId', 'storeId'])
@Index(['householdId'])
@Index(['householdId', 'productId'])
@Index(['householdId', 'storeId'])
export class ProductStore {
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

  @Column({ type: 'varchar' })
  storeId!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store?: Store;

  @Column({ type: 'varchar', nullable: true })
  aisle!: string | null;

  @Column({ type: 'integer', nullable: true })
  aisleOrder!: number | null;

  @Column({ type: 'real', nullable: true })
  averagePrice!: number | null;

  @Column({ type: 'boolean', default: false })
  isPreferred!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
