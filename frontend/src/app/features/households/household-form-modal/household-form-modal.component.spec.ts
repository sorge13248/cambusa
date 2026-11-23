import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HouseholdFormModalComponent, HouseholdFormModalData } from './household-form-modal.component.js';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/api.service.js';

describe('HouseholdFormModalComponent', () => {
  let component: HouseholdFormModalComponent;
  let fixture: ComponentFixture<HouseholdFormModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
    backdropClick: { subscribe: vi.fn() },
    keydownEvents: { subscribe: vi.fn() },
  };

  const mockDialog = {
    open: vi.fn(),
  };

  const mockApiService = {
    createHousehold: vi.fn().mockResolvedValue({ id: 'hh1', name: 'New Home' }),
    updateHousehold: vi.fn().mockResolvedValue({ id: 'hh1', name: 'Renamed Home' }),
  };

  const mockData: HouseholdFormModalData = {
    householdId: undefined,
    currentName: undefined,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HouseholdFormModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: mockData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: Dialog, useValue: mockDialog },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HouseholdFormModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and save new household', async () => {
    component.name = 'New Home';
    await component.save();
    expect(mockApiService.createHousehold).toHaveBeenCalledWith('New Home');
    expect(mockDialogRef.close).toHaveBeenCalledWith({ id: 'hh1', name: 'New Home' });
  });
});
