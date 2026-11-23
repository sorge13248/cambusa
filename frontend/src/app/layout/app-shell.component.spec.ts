import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppShellComponent } from './app-shell.component.js';
import { AuthService } from '../core/auth.service.js';
import { SyncService } from '../core/sync.service.js';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

describe('AppShellComponent', () => {
  let component: AppShellComponent;
  let fixture: ComponentFixture<AppShellComponent>;

  const mockAuthService = {
    isAuthenticated: signal(true),
    currentUser: signal<{ displayName: string; pictureUrl: string | null }>({ displayName: 'Test User', pictureUrl: null }),
    pictureUrl: signal<string | null>(null),
    initials: signal('TU'),
    activeHousehold: signal({ id: 'h1', name: 'Main Home' }),
    activeHouseholdId: signal('h1'),
    households: signal([{ id: 'h1', name: 'Main Home', role: 'owner' }]),
    pendingInvitationsCount: signal(0),
    switchHousehold: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
  };

  const mockSyncService = {
    status: signal('online-ok'),
    pendingCount: signal(0),
    isOnline: signal(true),
    lastSyncTime: signal(null),
    lastError: signal(null),
    sync: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: SyncService, useValue: mockSyncService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle household menu', () => {
    expect(component.isHouseholdMenuOpen()).toBe(false);
    component.toggleHouseholdMenu();
    expect(component.isHouseholdMenuOpen()).toBe(true);
    component.closeHouseholdMenu();
    expect(component.isHouseholdMenuOpen()).toBe(false);
  });

  it('should close household menu on click outside', () => {
    component.toggleHouseholdMenu();
    expect(component.isHouseholdMenuOpen()).toBe(true);

    const outsideElement = document.createElement('div');
    document.body.appendChild(outsideElement);
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: outsideElement });

    component.onDocumentClick(clickEvent);
    expect(component.isHouseholdMenuOpen()).toBe(false);
    document.body.removeChild(outsideElement);
  });

  it('should close household menu on escape key', () => {
    component.toggleHouseholdMenu();
    expect(component.isHouseholdMenuOpen()).toBe(true);

    component.onEscape();
    expect(component.isHouseholdMenuOpen()).toBe(false);
  });

  it('should toggle mobile navigation menu', () => {
    expect(component.isMobileMenuOpen()).toBe(false);
    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(true);
    component.closeMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(false);
  });

  it('should close mobile menu on escape key', () => {
    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(true);

    component.onEscape();
    expect(component.isMobileMenuOpen()).toBe(false);
  });

  it('should select household and trigger sync', () => {
    component.selectHousehold('h2');
    expect(mockAuthService.switchHousehold).toHaveBeenCalledWith('h2');
    expect(mockSyncService.sync).toHaveBeenCalled();
  });

  it('should render avatar img when pictureUrl is provided', () => {
    mockAuthService.currentUser.set({ displayName: 'Avatar User', pictureUrl: 'https://avatar.test/pic.png' });
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('.user-avatar-icon img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://avatar.test/pic.png');
  });
});
