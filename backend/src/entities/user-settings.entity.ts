import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'user_settings' })
@Unique(['userId'])
@Index(['userId'])
export class UserSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'integer', default: 5 })
  nextExpiringDays!: number;

  @Column({ type: 'varchar', nullable: true })
  mealieUrl!: string | null;

  @Column({ type: 'varchar', nullable: true })
  mealieApiToken!: string | null;

  @Column({ type: 'boolean', default: false })
  mealieLinked!: boolean;

  @Column({ type: 'varchar', nullable: true })
  notificationEmail!: string | null;

  @Column({ type: 'boolean', default: false })
  emailNotificationsEnabled!: boolean;

  @Column({ type: 'varchar', default: '06:00' })
  notificationTime!: string;

  @Column({ type: 'varchar', nullable: true })
  lastNotificationSentDate!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
