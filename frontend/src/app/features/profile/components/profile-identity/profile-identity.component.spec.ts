import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileIdentityComponent } from './profile-identity.component.js';
import { User } from '../../../../core/models.js';

describe('ProfileIdentityComponent', () => {
  let component: ProfileIdentityComponent;
  let fixture: ComponentFixture<ProfileIdentityComponent>;

  const mockUser: User = {
    id: 'usr-1',
    displayName: 'Captain Cambusa',
    email: 'captain@cambusa.local',
    pictureUrl: 'https://avatar.test/captain.webp',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileIdentityComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileIdentityComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('user', mockUser);
    fixture.detectChanges();
  });

  it('renders user details and avatar image', () => {
    expect(component).toBeTruthy();
    const displayName = fixture.nativeElement.querySelector('.display-name');
    expect(displayName.textContent).toContain('Captain Cambusa');

    const email = fixture.nativeElement.querySelector('.user-email');
    expect(email.textContent).toContain('captain@cambusa.local');

    const img = fixture.nativeElement.querySelector('.user-avatar-img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://avatar.test/captain.webp');
  });

  it('renders initial letter when pictureUrl is null', () => {
    fixture.componentRef.setInput('user', { ...mockUser, pictureUrl: null });
    fixture.detectChanges();

    const avatar = fixture.nativeElement.querySelector('.user-avatar-large');
    expect(avatar.textContent.trim()).toBe('C');
  });
});
