import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAlertTriangle } from '@lucide/angular';
import { AuthService } from '../../core/auth.service.js';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule, LucideAlertTriangle],
  templateUrl: './callback.component.html',
  styleUrl: './callback.component.scss',
})
export class CallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const err = params.get('error');

    if (err) {
      this.error.set(err);
      this.loading.set(false);
      return;
    }

    try {
      await this.auth.init();
      const returnUrl = this.auth.consumeReturnUrl() || '/home';
      await this.router.navigate([returnUrl]);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to authenticate user.');
    } finally {
      this.loading.set(false);
    }
  }

  retry(): void {
    this.auth.login();
  }
}
