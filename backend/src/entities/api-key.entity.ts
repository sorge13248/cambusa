import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'api_keys' })
@Index(['userId'])
@Index(['keyHash'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  keyHash!: string;

  @Column({ type: 'varchar' })
  keyPrefix!: string;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
