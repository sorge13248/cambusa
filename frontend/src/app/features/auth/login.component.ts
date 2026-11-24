import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LucideLock, LucidePackage, LucideShieldCheck } from '@lucide/angular';
import { AuthService } from '../../core/auth.service.js';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, LucidePackage, LucideLock, LucideShieldCheck],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    if (this.auth.isAuthenticated()) {
      await this.router.navigate(['/home']);
    }
  }

  signIn(): void {
    this.auth.login();
  }
}
