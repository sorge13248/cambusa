import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { LucideAlertTriangle, LucideCheck } from '@lucide/angular';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { ProfileDataDto, UserSettingsDto } from '../../core/models.js';
import { TabItem, TabViewComponent } from '../../shared/components/tab-view/tab-view.component.js';
import { ProfileIdentityComponent } from './components/profile-identity/profile-identity.component.js';
import { ProfileExpirationsComponent } from './components/profile-expirations/profile-expirations.component.js';
import { ProfileMealieComponent } from './components/profile-mealie/profile-mealie.component.js';
import { ProfileNotificationsComponent } from './components/profile-notifications/profile-notifications.component.js';
import { ProfileApiKeysComponent } from './components/profile-api-keys/profile-api-keys.component.js';
import { ProfileDomainsComponent } from './components/profile-domains/profile-domains.component.js';

export type ProfileTab = 'account' | 'next' | 'mealie' | 'notifications' | 'apikeys' | 'domains';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    TabViewComponent,
    ProfileIdentityComponent,
    ProfileExpirationsComponent,
    ProfileMealieComponent,
    ProfileNotificationsComponent,
    ProfileApiKeysComponent,
    ProfileDomainsComponent,
    LucideAlertTriangle,
    LucideCheck,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly profileData = signal<ProfileDataDto | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly activeTab = signal<ProfileTab>('account');

  readonly profileTabs: TabItem<ProfileTab>[] = [
    { id: 'account', label: 'Identity', lucideIcon: 'user' },
    { id: 'next', label: 'Expirations', lucideIcon: 'zap' },
    { id: 'mealie', label: 'Mealie', lucideIcon: 'utensils' },
    { id: 'notifications', label: 'Notifications', lucideIcon: 'bell' },
    { id: 'apikeys', label: 'API Keys', lucideIcon: 'key' },
    { id: 'domains', label: 'Domains', lucideIcon: 'globe' },
  ];

  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  ngOnInit(): void {
    this.loadProfile();
  }

  showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 4000);
  }

  async loadProfile(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await this.api.getProfile();
      this.profileData.set(data);
    } catch {
      this.showToast('error', 'Failed to load user profile data');
    } finally {
      this.isLoading.set(false);
    }
  }

  onDaysChanged(days: number): void {
    const current = this.profileData();
    if (current) {
      this.profileData.set({
        ...current,
        settings: {
          ...current.settings,
          nextExpiringDays: days,
        },
      });
    }
  }

  onTimerChanged(timer: number): void {
    const current = this.profileData();
    if (current) {
      this.profileData.set({
        ...current,
        settings: {
          ...current.settings,
          quickConsumeTimerSeconds: timer,
        },
      });
    }
  }

  onSettingsUpdated(updated: UserSettingsDto): void {
    const current = this.profileData();
    if (current) {
      this.profileData.set({
        ...current,
        settings: updated,
      });
    }
  }
}
