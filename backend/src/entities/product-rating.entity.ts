import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Household } from './household.entity.js';
import { Product } from './product.entity.js';
import { User } from './user.entity.js';

@Entity({ name: 'product_ratings' })
@Unique(['productId', 'userId'])
@Index(['householdId', 'productId'])
@Index(['householdId', 'userId'])
export class ProductRating {
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
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'integer', nullable: true })
  rating!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
