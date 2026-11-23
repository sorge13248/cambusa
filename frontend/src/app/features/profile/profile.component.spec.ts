import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileComponent } from './profile.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { Dialog } from '@angular/cdk/dialog';
import { ProfileDataDto } from '../../core/models.js';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;

  const mockProfileData: ProfileDataDto = {
    user: {
      id: 'usr-1',
      displayName: 'Captain Cambusa',
      email: 'captain@cambusa.local',
      pictureUrl: null,
    },
    settings: {
      nextExpiringDays: 7,
      mealieUrl: 'https://mealie.test',
      mealieLinked: true,
      hasMealieToken: true,
      notificationEmail: 'notify@cambusa.local',
      emailNotificationsEnabled: true,
      notificationTime: '07:30',
      smtpConfigured: true,
    },
    apiKeys: [
      {
        id: 'key-1',
        name: 'Home Assistant',
        keyPrefix: 'cambusa_ak_1234...',
        createdAt: '2026-11-20T10:00:00Z',
        lastUsedAt: null,
      },
    ],
  };

  const mockApiService = {
    getProfile: vi.fn().mockResolvedValue(mockProfileData),
    updateProfileSettings: vi.fn().mockResolvedValue({
      nextExpiringDays: 10,
      mealieUrl: 'https://mealie.test',
      mealieLinked: true,
      hasMealieToken: true,
      notificationEmail: 'notify@cambusa.local',
      emailNotificationsEnabled: true,
      notificationTime: '07:30',
      smtpConfigured: true,
    }),
    testNotification: vi.fn().mockResolvedValue({
      ok: true,
      message: 'Test notification sent successfully',
    }),
    testMealie: vi.fn().mockResolvedValue({
      ok: true,
      version: 'v1.4.0',
      recipeCount: 42,
    }),
    createApiKey: vi.fn().mockResolvedValue({
      id: 'key-2',
      name: 'Script',
      keyPrefix: 'cambusa_ak_abcd...',
      rawKey: 'cambusa_ak_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      createdAt: '2026-11-23T12:00:00Z',
    }),
    revokeApiKey: vi.fn().mockResolvedValue(undefined),
  };

  const mockAuthService = {
    currentUser: vi.fn().mockReturnValue(mockProfileData.user),
    isAuthenticated: vi.fn().mockReturnValue(true),
  };

  const mockDialog = {
    open: vi.fn().mockReturnValue({
      closed: {
        toPromise: vi.fn().mockResolvedValue(true),
      },
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        { provide: ApiService, useValue: mockApiService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: Dialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
  });

  it('creates and loads profile data on init', async () => {
    expect(component).toBeTruthy();
    await component.ngOnInit();
    expect(mockApiService.getProfile).toHaveBeenCalled();
    expect(component.profileData()).toEqual(mockProfileData);
    expect(component.nextExpiringDays()).toBe(7);
    expect(component.mealieUrl()).toBe('https://mealie.test');
  });

  it('updates next engine horizon setting', async () => {
    await component.ngOnInit();
    component.nextExpiringDays.set(10);
    await component.saveNextSettings();
    expect(mockApiService.updateProfileSettings).toHaveBeenCalledWith({ nextExpiringDays: 10 });
    expect(component.nextExpiringDays()).toBe(10);
  });

  it('tests mealie connection successfully', async () => {
    await component.ngOnInit();
    component.mealieUrl.set('https://mealie.test');
    await component.testMealieConnection();
    expect(mockApiService.testMealie).toHaveBeenCalledWith({
      url: 'https://mealie.test',
      token: '',
    });
    expect(component.mealieTestStatus()?.ok).toBe(true);
    expect(component.mealieTestStatus()?.message).toContain('v1.4.0');
  });

  it('generates a new API key and reveals raw key', async () => {
    await component.ngOnInit();
    component.openCreateKeyModal();
    expect(component.showCreateKeyModal()).toBe(true);

    component.newKeyName.set('Script');
    await component.confirmCreateKey();

    expect(mockApiService.createApiKey).toHaveBeenCalledWith('Script');
    expect(component.createdKey()).toBeTruthy();
    expect(component.createdKey()?.rawKey).toContain('cambusa_ak_');
    expect(component.showCreateKeyModal()).toBe(false);
  });

  it('revokes an API key after confirmation', async () => {
    await component.ngOnInit();
    const keyToRevoke = mockProfileData.apiKeys[0];
    await component.revokeApiKey(keyToRevoke);

    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockApiService.revokeApiKey).toHaveBeenCalledWith('key-1');
  });

  it('loads and saves notification settings', async () => {
    await component.ngOnInit();
    expect(component.notificationEmail()).toBe('notify@cambusa.local');
    expect(component.emailNotificationsEnabled()).toBe(true);
    expect(component.notificationTime()).toBe('07:30');

    component.notificationEmail.set('new-email@cambusa.local');
    component.emailNotificationsEnabled.set(true);
    component.notificationTime.set('06:00');

    await component.saveNotificationSettings();
    expect(mockApiService.updateProfileSettings).toHaveBeenCalledWith({
      notificationEmail: 'new-email@cambusa.local',
      emailNotificationsEnabled: true,
      notificationTime: '06:00',
    });
  });

  it('triggers test email notification', async () => {
    await component.ngOnInit();
    await component.testNotification();
    expect(mockApiService.testNotification).toHaveBeenCalled();
    expect(component.notificationTestStatus()?.ok).toBe(true);
    expect(component.notificationTestStatus()?.message).toContain('Test notification sent successfully');
  });

  it('renders user avatar picture when pictureUrl is provided', async () => {
    mockApiService.getProfile.mockResolvedValue({
      ...mockProfileData,
      user: {
        ...mockProfileData.user,
        pictureUrl: 'https://avatar.test/captain.webp',
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('.user-avatar-large img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://avatar.test/captain.webp');
  });
});
