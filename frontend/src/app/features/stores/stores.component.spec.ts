import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoresComponent } from './stores.component.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { signal } from '@angular/core';

describe('StoresComponent', () => {
  let component: StoresComponent;
  let fixture: ComponentFixture<StoresComponent>;

  const mockApiService = {
    getStores: vi.fn().mockResolvedValue([{ id: 's1', name: 'Coop', description: 'Grocery' }]),
    createStore: vi.fn().mockResolvedValue({ id: 's2', name: 'Lidl' }),
    updateStore: vi.fn().mockResolvedValue({ id: 's1', name: 'Coop Updated' }),
    deleteStore: vi.fn().mockResolvedValue(undefined),
  };

  const mockAuthService = {
    activeHouseholdId: signal('h1'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StoresComponent],
      providers: [
        { provide: ApiService, useValue: mockApiService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StoresComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load stores', () => {
    expect(component).toBeTruthy();
    expect(mockApiService.getStores).toHaveBeenCalled();
    expect(component.stores().length).toBe(1);
  });

  it('should open modal and save new store', async () => {
    component.openAddStoreModal();
    expect(component.isModalOpen()).toBe(true);
    component.storeName = 'Lidl';
    await component.saveStore();
    expect(mockApiService.createStore).toHaveBeenCalledWith({
      name: 'Lidl',
      description: undefined,
    });
    expect(component.isModalOpen()).toBe(false);
  });
});
