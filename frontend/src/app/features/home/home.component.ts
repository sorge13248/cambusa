import { CommonModule } from '@angular/common';
import { Component, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom, Subscription } from 'rxjs';
import {
  LucideAlertCircle,
  LucideAlertTriangle,
  LucideBoxes,
  LucideCheckCircle2,
  LucideClock,
  LucideMapPin,
  LucidePackage,
  LucideSparkles,
} from '@lucide/angular';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { UndoService } from '../../core/undo.service.js';
import { NextItemDto, NextResponseDto } from '../../core/models.js';
import { PantryActionModalComponent } from '../pantry/pantry-action-modal/pantry-action-modal.component.js';
import { QuickActionsFooterComponent } from '../../shared/components/quick-actions-footer/quick-actions-footer.component.js';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    LucideAlertCircle,
    LucideAlertTriangle,
    LucideBoxes,
    LucideCheckCircle2,
    LucideClock,
    LucideMapPin,
    LucidePackage,
    LucideSparkles,
    QuickActionsFooterComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly undoService = inject(UndoService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private queryParamSub?: Subscription;
  private isModalOpen = false;
  pendingOpenProductPromise: Promise<void> | null = null;

  readonly nextData = signal<NextResponseDto | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      const hhId = this.auth.activeHouseholdId();
      if (hhId) {
        this.loadDashboardData();
      }
    });

    effect(() => {
      const undoCount = this.undoService.onUndoExecuted();
      if (undoCount > 0) {
        this.loadDashboardData();
      }
    });
  }

  async ngOnInit() {
    this.listenToQueryParams();
    await this.loadDashboardData();
    if (this.pendingOpenProductPromise) {
      await this.pendingOpenProductPromise;
    }
  }

  ngOnDestroy() {
    this.queryParamSub?.unsubscribe();
  }

  private listenToQueryParams(): void {
    this.queryParamSub = this.route.queryParamMap.subscribe((params) => {
      const targetHh = params.get('householdId');
      if (targetHh && targetHh !== this.auth.activeHouseholdId()) {
        this.auth.switchHousehold(targetHh);
      }

      const productId = params.get('openProduct') || params.get('productId');
      if (productId && !this.isModalOpen) {
        // Clear query parameters so reloading or navigating doesn't loop
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { openProduct: null, productId: null, householdId: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });

        this.pendingOpenProductPromise = this.openProductById(productId);
      }
    });
  }

  async loadDashboardData() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const data = await this.api.getNext();
      this.nextData.set(data);
    } catch {
      this.errorMessage.set('Could not fetch dashboard metrics. Please ensure you are connected.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async openProductActionModal(item: NextItemDto): Promise<void> {
    await this.openProductById(item.productId);
  }

  async openProductById(productId: string): Promise<void> {
    if (this.isModalOpen) return;
    this.isModalOpen = true;

    try {
      const [prod, stock, locations, stores, units, allProducts, productGroups] = await Promise.all([
        this.api.getProduct(productId),
        this.api.getStock(),
        this.api.getLocations(),
        this.api.getStores(),
        this.api.getUnits(),
        this.api.getProducts(),
        this.api.getGroups(),
      ]);

      if (!prod) return;

      const dialogRef = this.dialog.open(PantryActionModalComponent, {
        disableClose: true,
        data: {
          product: prod,
          stockItems: stock,
          locations,
          stores,
          units,
          allProducts,
          productGroups,
        },
      });

      const res: any = await firstValueFrom(dialogRef.closed);
      if (res && res.refreshed) {
        await this.loadDashboardData();
      }
    } catch (err) {
      console.error('Failed to open pantry action modal from dashboard:', err);
    } finally {
      this.isModalOpen = false;
    }
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }
}
