import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CallbackComponent } from './callback.component.js';
import { AuthService } from '../../core/auth.service.js';
import { ActivatedRoute, Router } from '@angular/router';

describe('CallbackComponent', () => {
  let component: CallbackComponent;
  let fixture: ComponentFixture<CallbackComponent>;

  const mockAuthService = {
    init: vi.fn().mockResolvedValue(undefined),
    login: vi.fn(),
    consumeReturnUrl: vi.fn().mockReturnValue(null),
  };

  const mockRouter = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  const mockRoute = {
    snapshot: {
      queryParamMap: {
        get: vi.fn().mockReturnValue(null),
      },
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CallbackComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CallbackComponent);
    component = fixture.componentInstance;
  });

  it('should initialize and redirect to /home on success', async () => {
    await component.ngOnInit();
    expect(mockAuthService.init).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('should handle error query param', async () => {
    (mockRoute.snapshot.queryParamMap.get as any).mockImplementation((key: string) => {
      if (key === 'error') return 'access_denied';
      return null;
    });

    await component.ngOnInit();
    expect(component.error()).toBe('access_denied');
    expect(component.loading()).toBe(false);
  });
});
