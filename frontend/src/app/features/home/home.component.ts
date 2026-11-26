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
import { SyncService } from '../../core/sync.service.js';
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
  private readonly syncService = inject(SyncService);
  private readonly undoService = inject(UndoService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private queryParamSub?: Subscription;
  private isModalOpen = false;
  pendingOpenProductPromise: Promise<void> | null = null;
  private readonly undoSnapshotStack: NextResponseDto[] = [];
  private lastLoadedHouseholdId: string | null = null;
  private isInitialized = false;

  readonly nextData = signal<NextResponseDto | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      const hhId = this.auth.activeHouseholdId();
      if (hhId && hhId !== this.lastLoadedHouseholdId) {
        this.lastLoadedHouseholdId = hhId;
        this.loadDashboardData(false);
      }
    });

    effect(() => {
      const syncCount = this.syncService.onSyncCompleted();
      if (syncCount > 0 && this.isInitialized) {
        this.recomputeSilently();
      }
    });

    effect(() => {
      const undoCount = this.undoService.onUndoExecuted();
      if (undoCount > 0) {
        if (this.undoSnapshotStack.length > 0) {
          const snapshot = this.undoSnapshotStack.pop()!;
          this.nextData.set(snapshot);
        } else {
          this.recomputeSilently();
        }
      }
    });
  }

  async ngOnInit() {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    this.listenToQueryParams();
    this.lastLoadedHouseholdId = this.auth.activeHouseholdId();
    await this.loadDashboardData(true);
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

  async loadDashboardData(showLoading = true) {
    if (showLoading && !this.nextData()) {
      this.isLoading.set(true);
    }
    this.errorMessage.set(null);
    try {
      const data = await this.api.getNext();
      this.nextData.set(data);
    } catch {
      if (!this.nextData()) {
        this.errorMessage.set('Could not fetch dashboard metrics. Please ensure you are connected.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async recomputeSilently(): Promise<void> {
    try {
      const [stock, prods, units, locs] = await Promise.all([
        this.api.getStock().catch(() => []),
        this.api.getProducts().catch(() => []),
        this.api.getUnits().catch(() => []),
        this.api.getLocations().catch(() => []),
      ]);
      const current = this.nextData();
      const configuredDays = current?.summary?.configuredDays || 5;
      const computed = this.api.computeNextDataLocally(stock, prods, configuredDays, {
        units,
        locations: locs,
      });
      this.nextData.set(computed);
    } catch {
      // If silent recompute fails, keep existing display
    }
  }

  onQuickStockChanged(): void {
    this.recomputeSilently();
  }

  applyOptimisticAction(res: any): void {
    const current = this.nextData();
    if (!current) {
      this.recomputeSilently();
      return;
    }

    // Save deep copy for instant optimistic undo
    this.undoSnapshotStack.push(JSON.parse(JSON.stringify(current)));

    const next = JSON.parse(JSON.stringify(current)) as NextResponseDto;
    const action = res.action;
    const stockItemId = res.stockItemId;
    const productId = res.productId;
    const amount = res.amount ?? 1;

    if (action === 'consume') {
      let foundIndex = next.expired.findIndex((i) => i.id === stockItemId || (productId && i.productId === productId));
      let inExpired = true;
      if (foundIndex === -1) {
        foundIndex = next.expiringSoon.findIndex(
          (i) => i.id === stockItemId || (productId && i.productId === productId),
        );
        inExpired = false;
      }

      if (foundIndex !== -1) {
        const list = inExpired ? next.expired : next.expiringSoon;
        const target = list[foundIndex];
        if (target.amount <= amount) {
          list.splice(foundIndex, 1);
          if (inExpired) {
            next.summary.expiredCount = Math.max(0, next.summary.expiredCount - 1);
          } else {
            next.summary.expiringSoonCount = Math.max(0, next.summary.expiringSoonCount - 1);
          }
        } else {
          target.amount = Math.round((target.amount - amount) * 100) / 100;
        }
      }

      next.summary.totalStockItems = Math.max(
        0,
        Math.round((next.summary.totalStockItems - amount) * 100) / 100,
      );

      const hasMoreInLists =
        next.expired.some((i) => i.productId === productId) ||
        next.expiringSoon.some((i) => i.productId === productId);
      if (!hasMoreInLists && foundIndex !== -1) {
        next.summary.totalUniqueProductsInStock = Math.max(0, next.summary.totalUniqueProductsInStock - 1);
      }

      this.nextData.set(next);
      return;
    }

    if (action === 'open') {
      this.recomputeSilently();
      return;
    }

    if (action === 'adjustDate') {
      const newDate = res.newDate;
      const allAlerts = [...next.expired, ...next.expiringSoon];
      const target = allAlerts.find((i) => i.id === stockItemId || (productId && i.productId === productId));
      if (target) {
        next.expired = next.expired.filter((i) => i !== target);
        next.expiringSoon = next.expiringSoon.filter((i) => i !== target);

        if (newDate) {
          target.bestBeforeDate = newDate;
          const todayStr = new Date().toISOString().slice(0, 10);
          const targetLimit = new Date();
          targetLimit.setDate(new Date().getDate() + (next.summary.configuredDays || 5));
          const targetLimitStr = targetLimit.toISOString().slice(0, 10);

          const diffMs =
            new Date(`${newDate}T00:00:00Z`).getTime() - new Date(`${todayStr}T00:00:00Z`).getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

          if (newDate < todayStr) {
            target.daysOverdue = Math.abs(diffDays);
            delete (target as any).daysRemaining;
            next.expired.push(target);
            next.expired.sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
          } else if (newDate <= targetLimitStr) {
            target.daysRemaining = diffDays;
            delete (target as any).daysOverdue;
            next.expiringSoon.push(target);
            next.expiringSoon.sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0));
          }
        }

        next.summary.expiredCount = next.expired.length;
        next.summary.expiringSoonCount = next.expiringSoon.length;
        this.nextData.set(next);
      }
      return;
    }

    if (action === 'move') {
      const allAlerts = [...next.expired, ...next.expiringSoon];
      const target = allAlerts.find((i) => i.id === stockItemId || (productId && i.productId === productId));
      if (target && res.locationName) {
        target.location = res.locationName;
        this.nextData.set(next);
      }
      return;
    }

    if (action === 'purchase') {
      next.summary.totalStockItems = Math.round((next.summary.totalStockItems + amount) * 100) / 100;
      this.nextData.set(next);
      return;
    }

    // Default optimistic update: recompute silently from local storage without reloading API
    this.recomputeSilently();
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
        this.applyOptimisticAction(res);
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
