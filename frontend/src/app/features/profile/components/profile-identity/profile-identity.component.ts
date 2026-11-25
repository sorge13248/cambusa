import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { User } from '../../../../core/models.js';

@Component({
  selector: 'app-profile-identity',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-identity.component.html',
  styleUrl: './profile-identity.component.scss',
})
export class ProfileIdentityComponent {
  readonly user = input<User | null | undefined>(null);
}
