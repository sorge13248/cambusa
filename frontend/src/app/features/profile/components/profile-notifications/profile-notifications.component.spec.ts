import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ProfileNotificationsComponent } from './profile-notifications.component.js';
import { ApiService } from '../../../../core/api.service.js';

describe('ProfileNotificationsComponent', () => {
  let component: ProfileNotificationsComponent;
  let fixture: ComponentFixture<ProfileNotificationsComponent>;
  let apiService: ApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileNotificationsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ApiService,
          useValue: {
            testNotification: vi.fn().mockResolvedValue({ ok: true, message: 'Email sent' }),
            updateProfileSettings: vi.fn().mockResolvedValue({
              emailNotificationsEnabled: true,
              notificationTime: '07:30',
              notificationEmail: 'test@example.com',
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileNotificationsComponent);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should test notification successfully', async () => {
    const toastSpy = vi.spyOn(component.toast, 'emit');

    await component.testNotification();

    expect(apiService.testNotification).toHaveBeenCalled();
    expect(component.testStatus()?.ok).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('should save notification settings', async () => {
    component.emailNotificationsEnabled.set(true);
    component.notificationTime.set('07:30');
    component.notificationEmail.set('test@example.com');
    const toastSpy = vi.spyOn(component.toast, 'emit');

    await component.saveSettings();

    expect(apiService.updateProfileSettings).toHaveBeenCalledWith({
      emailNotificationsEnabled: true,
      notificationTime: '07:30',
      notificationEmail: 'test@example.com',
    });
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });
});
