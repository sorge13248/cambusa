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
            testMealSlotNotification: vi.fn().mockResolvedValue({ ok: true, message: 'Meal slot email sent' }),
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

  it('should save recipient email address from standalone card', async () => {
    component.notificationEmail.set('custom@example.com');
    const toastSpy = vi.spyOn(component.toast, 'emit');

    await component.saveRecipientEmail();

    expect(apiService.updateProfileSettings).toHaveBeenCalledWith({
      notificationEmail: 'custom@example.com',
    });
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('should save meal planner slot notification settings', async () => {
    component.updateMealSlotConfig('lunch', { enabled: true, time: '12:30', onlyIfHasEntries: false });
    const toastSpy = vi.spyOn(component.toast, 'emit');

    await component.saveMealSlotSettings();

    expect(apiService.updateProfileSettings).toHaveBeenCalledWith({
      mealPlanEmailSettings: expect.objectContaining({
        lunch: { enabled: true, time: '12:30', onlyIfHasEntries: false },
      }),
    });
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('should test meal slot notification', async () => {
    const toastSpy = vi.spyOn(component.toast, 'emit');

    await component.testMealSlot('dinner');

    expect(apiService.testMealSlotNotification).toHaveBeenCalledWith('dinner');
    expect(component.mealSlotTestStatus()?.ok).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });
});
