import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ProfileExpirationsComponent } from './profile-expirations.component.js';
import { ApiService } from '../../../../core/api.service.js';

describe('ProfileExpirationsComponent', () => {
  let component: ProfileExpirationsComponent;
  let fixture: ComponentFixture<ProfileExpirationsComponent>;
  let apiService: ApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileExpirationsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ApiService,
          useValue: {
            updateProfileSettings: vi.fn().mockResolvedValue({ nextExpiringDays: 7 }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileExpirationsComponent);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService);
    fixture.detectChanges();
  });

  it('should create and initialize with default days', () => {
    expect(component).toBeTruthy();
    expect(component.days()).toBe(5);
  });

  it('should save horizon successfully', async () => {
    component.days.set(7);
    const toastSpy = vi.spyOn(component.toast, 'emit');
    const daysSpy = vi.spyOn(component.daysChanged, 'emit');

    await component.saveSettings();

    expect(apiService.updateProfileSettings).toHaveBeenCalledWith({ nextExpiringDays: 7 });
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(daysSpy).toHaveBeenCalledWith(7);
  });

  it('should reject invalid horizon days', async () => {
    component.days.set(0);
    const toastSpy = vi.spyOn(component.toast, 'emit');

    await component.saveSettings();

    expect(apiService.updateProfileSettings).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
