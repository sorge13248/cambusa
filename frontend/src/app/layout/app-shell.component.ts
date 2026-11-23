import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service.js';
import { SyncService } from '../core/sync.service.js';
import { SyncIndicatorComponent } from '../shared/components/sync-indicator/sync-indicator.component.js';
import { UndoToastComponent } from '../shared/components/undo-toast/undo-toast.component.js';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    SyncIndicatorComponent,
    UndoToastComponent,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly elementRef = inject(ElementRef);
  readonly auth = inject(AuthService);
  readonly sync = inject(SyncService);
  readonly router = inject(Router);

  readonly isHouseholdMenuOpen = signal<boolean>(false);
  readonly isMobileMenuOpen = signal<boolean>(false);

  toggleHouseholdMenu(event?: Event) {
    event?.stopPropagation();
    this.isHouseholdMenuOpen.update((v) => !v);
  }

  closeHouseholdMenu() {
    this.isHouseholdMenuOpen.set(false);
  }

  toggleMobileMenu(event?: Event) {
    event?.stopPropagation();
    this.isMobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu() {
    this.isMobileMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.isHouseholdMenuOpen()) {
      const container = this.elementRef.nativeElement.querySelector('.household-dropdown-container');
      if (container && !container.contains(event.target as Node)) {
        this.closeHouseholdMenu();
      }
    }

    if (this.isMobileMenuOpen()) {
      const drawer = this.elementRef.nativeElement.querySelector('.mobile-drawer');
      const hamburger = this.elementRef.nativeElement.querySelector('.hamburger-btn');
      const target = event.target as Node;
      if (drawer && !drawer.contains(target) && hamburger && !hamburger.contains(target)) {
        this.closeMobileMenu();
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeHouseholdMenu();
    this.closeMobileMenu();
  }

  selectHousehold(id: string) {
    this.auth.switchHousehold(id);
    this.closeHouseholdMenu();
    this.sync.sync();
  }
}
