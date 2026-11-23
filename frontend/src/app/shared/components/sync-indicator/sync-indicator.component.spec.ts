import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncIndicatorComponent } from './sync-indicator.component.js';
import { SyncService } from '../../../core/sync.service.js';
import { signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';

describe('SyncIndicatorComponent', () => {
  let component: SyncIndicatorComponent;
  let fixture: ComponentFixture<SyncIndicatorComponent>;

  const mockStatus = signal<'online-ok' | 'syncing' | 'offline' | 'conflict' | 'error'>('online-ok');
  const mockPendingCount = signal(0);
  const mockIsOnline = signal(true);
  const mockLastSyncTime = signal<Date | null>(new Date('2026-11-23T12:00:00Z'));
  const mockLastError = signal<string | null>(null);

  const mockSyncService = {
    status: mockStatus,
    pendingCount: mockPendingCount,
    isOnline: mockIsOnline,
    lastSyncTime: mockLastSyncTime,
    lastError: mockLastError,
    sync: vi.fn().mockResolvedValue(true),
    downloadServerVersion: vi.fn().mockResolvedValue(true),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  beforeEach(async () => {
    mockStatus.set('online-ok');
    mockPendingCount.set(0);
    mockIsOnline.set(true);
    mockLastSyncTime.set(new Date('2026-11-23T12:00:00Z'));
    mockLastError.set(null);

    await TestBed.configureTestingModule({
      imports: [SyncIndicatorComponent],
      providers: [
        { provide: SyncService, useValue: mockSyncService },
        { provide: Dialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SyncIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render status', () => {
    expect(component).toBeTruthy();
    expect(component.statusLabel()).toBe('Synced');
  });

  it('should toggle dropdown', () => {
    expect(component.dropdownOpen()).toBe(false);
    component.toggleDropdown();
    expect(component.dropdownOpen()).toBe(true);
    component.closeDropdown();
    expect(component.dropdownOpen()).toBe(false);
  });

  it('should trigger sync onSyncNow', async () => {
    await component.onSyncNow();
    expect(mockSyncService.sync).toHaveBeenCalled();
  });
});
