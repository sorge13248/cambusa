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

export type ProductCustomFieldType = 'string' | 'textarea' | 'int' | 'double' | 'boolean';

@Entity({ name: 'product_custom_fields' })
@Unique(['householdId', 'name'])
@Index(['householdId'])
export class ProductCustomField {
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

  @Column({ type: 'varchar', nullable: true })
  placeholder!: string | null;

  @Column({ type: 'varchar', default: 'string' })
  type!: ProductCustomFieldType;

  @Column({ type: 'text', nullable: true })
  defaultValue!: string | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
