import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DialogModule } from '@angular/cdk/dialog';
import { ProfileComponent } from './profile.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let apiService: ApiService;

  const mockProfileData = {
    user: { id: 'u1', email: 'test@example.com', displayName: 'Test User', pictureUrl: null },
    settings: {
      nextExpiringDays: 5,
      mealieUrl: null,
      mealieLinked: false,
      hasMealieToken: false,
      emailNotificationsEnabled: false,
      notificationTime: '06:00',
      notificationEmail: null,
      smtpConfigured: false,
    },
    apiKeys: [],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileComponent, DialogModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ApiService,
          useValue: {
            getProfile: vi.fn().mockResolvedValue(mockProfileData),
            getStores: vi.fn().mockResolvedValue([]),
            getStoreAisles: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => mockProfileData.user,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService);
    fixture.detectChanges();
  });

  it('should create and load profile on init', async () => {
    expect(component).toBeTruthy();
    await fixture.whenStable();
    expect(apiService.getProfile).toHaveBeenCalled();
    expect(component.profileData()).toEqual(mockProfileData);
    expect(component.isLoading()).toBe(false);
  });

  it('should switch active tab', () => {
    expect(component.activeTab()).toBe('account');
    component.activeTab.set('domains');
    expect(component.activeTab()).toBe('domains');
  });

  it('should display toast feedback', () => {
    component.showToast('success', 'Profile updated');
    expect(component.toast()).toEqual({ type: 'success', message: 'Profile updated' });
  });

  it('should update horizon days in profile data signal', () => {
    component.onDaysChanged(10);
    expect(component.profileData()?.settings.nextExpiringDays).toBe(10);
  });
});
