import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Household } from './household.entity.js';
import { ProductGroup } from './product-group.entity.js';
import { Location } from './location.entity.js';
import { Store } from './store.entity.js';
import { QuantityUnit } from './quantity-unit.entity.js';

export type DueType = 'best_before' | 'use_by';

export interface MealieLinkedFood {
  id: string;
  name: string;
}

export interface MealieLinkedRecipe {
  id: string;
  slug: string;
  name: string;
}

@Entity({ name: 'products' })
@Unique(['householdId', 'name'])
@Index(['householdId'])
@Index(['householdId', 'parentProductId'])
export class Product {
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

  @Column({ type: 'simple-json', default: '[]' })
  barcodes!: string[];

  @Column({ type: 'simple-json', default: '[]' })
  pictureFileNames!: string[];

  @Column({ type: 'simple-json', default: '[]' })
  mealieFoods!: MealieLinkedFood[];

  @Column({ type: 'simple-json', default: '[]' })
  mealieRecipes!: MealieLinkedRecipe[];

  @Column({ type: 'boolean', default: false })
  cannotBeFrozen!: boolean;

  @Column({ type: 'varchar', nullable: true })
  openLocationId!: string | null;

  @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'openLocationId' })
  openLocation?: Location | null;

  @Column({ type: 'boolean', default: false })
  moveOnOpen!: boolean;

  @Column({ type: 'varchar', nullable: true })
  defaultStoreId!: string | null;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'defaultStoreId' })
  defaultStore?: Store | null;

  @Column({ type: 'varchar', default: 'best_before' })
  dueType!: DueType;

  @Column({ type: 'integer', default: 0 })
  defaultBestBeforeDays!: number;

  @Column({ type: 'integer', nullable: true })
  defaultBestBeforeDaysAfterOpen!: number | null;

  @Column({ type: 'integer', nullable: true })
  defaultBestBeforeDaysAfterFreezing!: number | null;

  @Column({ type: 'integer', nullable: true })
  defaultBestBeforeDaysAfterThawing!: number | null;

  @Column({ type: 'real', default: 0 })
  minStockAmount!: number;

  @Column({ type: 'boolean', default: false })
  treatOpenedAsOutOfStock!: boolean;

  @Column({ type: 'varchar', nullable: true })
  productGroupId!: string | null;

  @ManyToOne(() => ProductGroup, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productGroupId' })
  productGroup?: ProductGroup | null;

  @Column({ type: 'varchar', nullable: true })
  defaultLocationId!: string | null;

  @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'defaultLocationId' })
  defaultLocation?: Location | null;

  @Column({ type: 'varchar', nullable: true })
  quStockId!: string | null;

  @ManyToOne(() => QuantityUnit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'quStockId' })
  quStock?: QuantityUnit | null;

  @Column({ type: 'varchar', nullable: true })
  quPurchaseId!: string | null;

  @ManyToOne(() => QuantityUnit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'quPurchaseId' })
  quPurchase?: QuantityUnit | null;

  @Column({ type: 'real', default: 1.0 })
  quFactor!: number;

  @Column({ type: 'integer', nullable: true })
  yukaScore!: number | null;

  @Column({ type: 'boolean', nullable: true })
  tastesGood!: boolean | null;

  @Column({ type: 'varchar', nullable: true })
  parentProductId!: string | null;

  @ManyToOne(() => Product, (p) => p.subProducts, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentProductId' })
  parentProduct?: Product | null;

  @OneToMany(() => Product, (p) => p.parentProduct)
  subProducts?: Product[];

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'simple-json', default: '{}' })
  customFields!: Record<string, string | number | boolean | null>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
