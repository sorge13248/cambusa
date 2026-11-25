import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog, DialogModule } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ProfileApiKeysComponent } from './profile-api-keys.component.js';
import { ApiService } from '../../../../core/api.service.js';

describe('ProfileApiKeysComponent', () => {
  let component: ProfileApiKeysComponent;
  let fixture: ComponentFixture<ProfileApiKeysComponent>;
  let apiService: ApiService;
  let dialog: Dialog;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileApiKeysComponent, DialogModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ApiService,
          useValue: {
            createApiKey: vi.fn().mockResolvedValue({
              id: 'k1',
              name: 'Home Assistant',
              rawKey: 'cambusa_ak_12345',
              keyPrefix: 'cambusa_ak_1234',
              createdAt: '2026-11-24T00:00:00.000Z',
            }),
            revokeApiKey: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileApiKeysComponent);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService);
    dialog = TestBed.inject(Dialog);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should generate api key and emit events', async () => {
    component.newKeyName.set('Home Assistant');
    const toastSpy = vi.spyOn(component.toast, 'emit');
    const refreshSpy = vi.spyOn(component.refreshRequested, 'emit');

    await component.confirmCreateKey();

    expect(apiService.createApiKey).toHaveBeenCalledWith('Home Assistant');
    expect(component.createdKey()).toBeTruthy();
    expect(component.createdKey()?.rawKey).toBe('cambusa_ak_12345');
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('should revoke api key when confirmed', async () => {
    vi.spyOn(dialog, 'open').mockReturnValue({
      closed: of(true),
    } as any);

    const toastSpy = vi.spyOn(component.toast, 'emit');
    const refreshSpy = vi.spyOn(component.refreshRequested, 'emit');

    await component.revokeApiKey({
      id: 'k1',
      name: 'Old Key',
      keyPrefix: 'cambusa_ak_old',
      lastUsedAt: null,
      createdAt: '2026-11-20T00:00:00.000Z',
    });

    expect(apiService.revokeApiKey).toHaveBeenCalledWith('k1');
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(refreshSpy).toHaveBeenCalled();
  });
});
