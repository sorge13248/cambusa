import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoginComponent } from './login.component.js';
import { AuthService } from '../../core/auth.service.js';
import { Router } from '@angular/router';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  const mockAuthService = {
    isAuthenticated: vi.fn().mockReturnValue(false),
    login: vi.fn(),
  };

  const mockRouter = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should redirect if already authenticated', async () => {
    mockAuthService.isAuthenticated.mockReturnValue(true);
    await component.ngOnInit();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('should call auth.login on signIn', () => {
    component.signIn();
    expect(mockAuthService.login).toHaveBeenCalled();
  });
});
