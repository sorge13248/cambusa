import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HouseholdsComponent } from './households.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';

describe('HouseholdsComponent', () => {
  let component: HouseholdsComponent;
  let fixture: ComponentFixture<HouseholdsComponent>;

  const mockApiService = {
    getHouseholdMembers: vi.fn().mockResolvedValue([
      { id: 'm1', displayName: 'Mario Rossi', email: 'mario@example.com', role: 'owner' },
    ]),
    getSentInvitations: vi.fn().mockResolvedValue([]),
    getReceivedInvitations: vi.fn().mockResolvedValue([]),
    deleteHousehold: vi.fn().mockResolvedValue(undefined),
    sendInvitation: vi.fn().mockResolvedValue({ id: 'inv1' }),
    revokeInvitation: vi.fn().mockResolvedValue(undefined),
    respondToInvitation: vi.fn().mockResolvedValue(undefined),
  };

  const mockAuthService = {
    activeHousehold: signal({ id: 'hh1', name: 'Main Home' }),
    activeHouseholdId: signal('hh1'),
    households: signal([{ id: 'hh1', name: 'Main Home', isOwner: true, memberCount: 1 }]),
    switchHousehold: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HouseholdsComponent],
      providers: [
        { provide: ApiService, useValue: mockApiService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: Dialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HouseholdsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load active household members', () => {
    expect(component).toBeTruthy();
    expect(mockApiService.getHouseholdMembers).toHaveBeenCalledWith('hh1');
    expect(component.members().length).toBe(1);
  });

  it('should switch household', () => {
    component.switchHousehold('hh2');
    expect(mockAuthService.switchHousehold).toHaveBeenCalledWith('hh2');
  });

  it('should render member avatar image when member has pictureUrl', () => {
    component.members.set([
      {
        id: 'm2',
        displayName: 'Luigi Verdi',
        email: 'luigi@example.com',
        role: 'member',
        userId: 'u-luigi',
        pictureUrl: 'https://avatar.test/luigi.webp',
        joinedAt: '2026-11-20T10:00:00Z',
      },
    ]);
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('.member-avatar img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://avatar.test/luigi.webp');
  });
});
