import { Component, inject, OnInit } from '@angular/core';
import { AuthService } from './core/auth.service.js';
import { SyncService } from './core/sync.service.js';
import { PwaUpdateService } from './core/pwa-update.service.js';
import { AppShellComponent } from './layout/app-shell.component.js';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AppShellComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private auth = inject(AuthService);
  private sync = inject(SyncService);
  private pwaUpdate = inject(PwaUpdateService);

  async ngOnInit(): Promise<void> {
    this.pwaUpdate.init();
    try {
      await this.auth.init();
      if (this.auth.isAuthenticated()) {
        await this.sync.sync();
      }
    } catch (e) {
      console.warn('Initial auth/sync bootstrap failed (offline or unauthenticated):', e);
    }
  }
}
