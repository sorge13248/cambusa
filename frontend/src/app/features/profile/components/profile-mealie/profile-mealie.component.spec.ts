import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ProfileMealieComponent } from './profile-mealie.component.js';
import { ApiService } from '../../../../core/api.service.js';

describe('ProfileMealieComponent', () => {
  let component: ProfileMealieComponent;
  let fixture: ComponentFixture<ProfileMealieComponent>;
  let apiService: ApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileMealieComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ApiService,
          useValue: {
            testMealie: vi.fn().mockResolvedValue({ ok: true, version: '1.0.0', recipeCount: 5 }),
            updateProfileSettings: vi.fn().mockResolvedValue({
              mealieUrl: 'https://mealie.local',
              mealieLinked: true,
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileMealieComponent);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should test connection successfully', async () => {
    component.mealieUrl.set('https://mealie.local');
    component.mealieToken.set('token123');
    const toastSpy = vi.spyOn(component.toast, 'emit');

    await component.testMealieConnection();

    expect(apiService.testMealie).toHaveBeenCalledWith({
      url: 'https://mealie.local',
      token: 'token123',
    });
    expect(component.testStatus()?.ok).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('should save mealie settings successfully', async () => {
    component.mealieUrl.set('https://mealie.local');
    const toastSpy = vi.spyOn(component.toast, 'emit');
    const updatedSpy = vi.spyOn(component.settingsUpdated, 'emit');

    await component.saveMealieSettings();

    expect(apiService.updateProfileSettings).toHaveBeenCalledWith({
      mealieUrl: 'https://mealie.local',
    });
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(updatedSpy).toHaveBeenCalled();
  });
});
