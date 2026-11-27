import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, effect, ElementRef, inject, OnInit, signal, untracked, viewChild } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup, moveItemInArray } from '@angular/cdk/drag-drop';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { firstValueFrom } from 'rxjs';
import {
  LucideApple,
  LucideChevronLeft,
  LucideChevronRight,
  LucideClock,
  LucideCoffee,
  LucideCookie,
  LucideMoon,
  LucidePlus,
  LucideTrash2,
  LucideUtensils,
} from '@lucide/angular';
import {
  HouseholdMemberDto,
  Location,
  MEAL_SLOTS,
  MealPlanEntry,
  MealSlot,
  MealSlotConfig,
  NextItemDto,
  NextResponseDto,
  Product,
  ProductGroup,
  QuantityUnit,
  SavedFilter,
  StockItem,
} from '../../core/models.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { SyncService } from '../../core/sync.service.js';
import { UndoService } from '../../core/undo.service.js';
import { compareByName } from '../../core/sorting.utils.js';
import { PlannerSlotModalComponent } from './planner-slot-modal/planner-slot-modal.component.js';
import { PantryActionModalComponent } from '../pantry/pantry-action-modal/pantry-action-modal.component.js';
import { ExpirationAlertsComponent, AlertDragItem } from '../../shared/components/expiration-alerts/expiration-alerts.component.js';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component.js';

export interface WeekDayColumn {
  date: string; // YYYY-MM-DD
  dayName: string;
  dateShort: string;
  dateLabel: string;
  isToday: boolean;
}

export interface CellEntryViewModel {
  entry: MealPlanEntry;
  productName: string;
  member: HouseholdMemberDto | null;
  initials: string;
}

@Component({
  selector: 'app-planner',
  standalone: true,
  imports: [
    CommonModule,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    CdkContextMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    LucideApple,
    LucideChevronLeft,
    LucideChevronRight,
    LucideClock,
    LucideCoffee,
    LucideCookie,
    LucideMoon,
    LucidePlus,
    LucideTrash2,
    LucideUtensils,
    ExpirationAlertsComponent,
    SidebarComponent,
  ],
  templateUrl: './planner.component.html',
  styleUrl: './planner.component.scss',
})
export class PlannerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);
  private readonly undoService = inject(UndoService);
  private readonly dialog = inject(Dialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly mealSlots: MealSlotConfig[] = MEAL_SLOTS;

  readonly weekOffset = signal<number>(0);
  readonly entries = signal<MealPlanEntry[]>([]);
  readonly stock = signal<StockItem[]>([]);
  readonly products = signal<Product[]>([]);
  readonly locations = signal<Location[]>([]);
  readonly productGroups = signal<ProductGroup[]>([]);
  readonly units = signal<QuantityUnit[]>([]);
  readonly savedFilters = signal<SavedFilter[]>([]);
  readonly members = signal<HouseholdMemberDto[]>([]);
  readonly expiringSoonDays = signal<number>(5);
  readonly isLoading = signal<boolean>(true);
  readonly isHorizontallyScrolled = signal<boolean>(false);
  readonly hoveredCell = signal<{ date: string; mealSlot: MealSlot } | null>(null);
  readonly isDesktop = signal<boolean>(false);
  readonly isAlertsSidebarOpen = signal<boolean>(false);

  readonly alertsData = computed<NextResponseDto>(() =>
    this.api.computeNextDataLocally(this.stock(), this.products(), this.expiringSoonDays(), {
      units: this.units(),
      locations: this.locations(),
    }),
  );

  readonly totalAlertCount = computed<number>(
    () => this.alertsData().expired.length + this.alertsData().expiringSoon.length,
  );

  private readonly calendarWrapper = viewChild<ElementRef<HTMLElement>>('calendarWrapper');

  private lastLoadedHouseholdId: string | null = null;
  private lastSyncCounter = 0;
  private hasScrolledInitialToday = false;

  readonly weekDays = computed<WeekDayColumn[]>(() => {
    const offset = this.weekOffset();
    const now = new Date();
    const todayStr = this.formatIsoDate(now);
    // Monday-based start of week
    const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + offset * 7);

    const days: WeekDayColumn[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const iso = this.formatIsoDate(d);
      days.push({
        date: iso,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dateShort: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dateLabel: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
        isToday: iso === todayStr,
      });
    }
    return days;
  });

  readonly weekRangeLabel = computed<string>(() => {
    const days = this.weekDays();
    if (days.length === 0) return '';
    return `${days[0].dateShort} – ${days[days.length - 1].dateShort}`;
  });

  readonly cellEntriesMap = computed<Map<string, CellEntryViewModel[]>>(() => {
    const prodMap = new Map(this.products().map((p) => [p.id, p]));
    const memberMap = new Map(this.members().map((m) => [m.userId, m]));
    const map = new Map<string, CellEntryViewModel[]>();

    for (const entry of this.entries()) {
      const key = `${entry.date}__${entry.mealSlot}`;
      const list = map.get(key) || [];
      const prod = prodMap.get(entry.productId);
      const member = entry.userId ? memberMap.get(entry.userId) ?? null : null;
      list.push({
        entry,
        productName: prod?.name || 'Unknown Product',
        member,
        initials: this.computeInitials(member?.displayName),
      });
      map.set(key, list);
    }
    return map;
  });

  constructor() {
    this.lastSyncCounter = this.sync.onSyncCompleted();

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 769px)');
      this.isDesktop.set(mql.matches);
      const onChange = (e: MediaQueryListEvent) => this.isDesktop.set(e.matches);
      mql.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => mql.removeEventListener('change', onChange));
    }

    effect(() => {
      const hhId = this.auth.activeHouseholdId();
      if (hhId && hhId !== this.lastLoadedHouseholdId) {
        this.lastLoadedHouseholdId = hhId;
        untracked(() => this.loadData());
      }
    });

    effect(() => {
      const syncCounter = this.sync.onSyncCompleted();
      if (syncCounter > this.lastSyncCounter) {
        this.lastSyncCounter = syncCounter;
        untracked(() => this.refreshEntriesAndStock());
      }
    });

    effect(() => {
      const wrapper = this.calendarWrapper();
      const offset = this.weekOffset();
      if (wrapper && offset === 0 && !this.hasScrolledInitialToday) {
        this.hasScrolledInitialToday = true;
        untracked(() => requestAnimationFrame(() => this.scrollTodayToLeft()));
      }
    });
  }

  ngOnInit(): void {
    const hhId = this.auth.activeHouseholdId();
    if (hhId && hhId !== this.lastLoadedHouseholdId) {
      this.lastLoadedHouseholdId = hhId;
      this.loadData();
    }
  }

  private formatIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private computeInitials(name?: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  async loadData(): Promise<void> {
    this.isLoading.set(true);
    try {
      const hhId = this.auth.activeHouseholdId();
      const [entries, stock, prods, locs, groups, units, filters, profile, members] = await Promise.all([
        this.api.getMealPlanEntries(),
        this.api.getStock(),
        this.api.getProducts(true),
        this.api.getLocations(),
        this.api.getGroups(),
        this.api.getUnits(),
        this.api.getSavedFilters(),
        this.api.getProfile().catch(() => null),
        hhId ? this.api.getHouseholdMembers(hhId).catch(() => []) : Promise.resolve([]),
      ]);

      if (profile?.settings?.nextExpiringDays) {
        this.expiringSoonDays.set(profile.settings.nextExpiringDays);
      }

      this.entries.set(entries);
      this.stock.set(stock);
      this.products.set(prods);
      this.locations.set([...locs].sort(compareByName));
      this.productGroups.set([...groups].sort(compareByName));
      this.units.set([...units].sort(compareByName));
      this.savedFilters.set(filters);
      this.members.set(members);
    } finally {
      this.isLoading.set(false);
    }
  }

  async refreshEntriesAndStock(): Promise<void> {
    const [entries, stock] = await Promise.all([
      this.api.getMealPlanEntries(),
      this.api.getStock(this.expiringSoonDays()),
    ]);
    this.entries.set(entries);
    this.stock.set(stock);
  }

  previousWeek(): void {
    this.weekOffset.update((w) => w - 1);
  }

  goToToday(): void {
    this.weekOffset.set(0);
    requestAnimationFrame(() => this.scrollTodayToLeft());
  }

  setHoveredCell(date: string, mealSlot: MealSlot): void {
    this.hoveredCell.set({ date, mealSlot });
  }

  clearHoveredCell(): void {
    this.hoveredCell.set(null);
  }

  onCalendarScroll(event: Event): void {
    const el = event.target as HTMLElement | null;
    this.isHorizontallyScrolled.set(Boolean(el && el.scrollLeft > 0));
  }

  private scrollTodayToLeft(): void {
    const wrapper = this.calendarWrapper()?.nativeElement;
    if (!wrapper || wrapper.scrollWidth <= wrapper.clientWidth) {
      this.isHorizontallyScrolled.set(false);
      return;
    }

    const dayHeaders = Array.from(wrapper.querySelectorAll<HTMLElement>('.day-header'));
    const todayIndex = dayHeaders.findIndex((el) => el.classList.contains('is-today'));
    if (todayIndex === -1) {
      return;
    }

    // When today is Monday (first column), keep scrollLeft at 0 so row labels remain visible on mobile
    if (todayIndex === 0) {
      wrapper.scrollLeft = 0;
      this.isHorizontallyScrolled.set(false);
      return;
    }

    const todayHeader = dayHeaders[todayIndex];
    if (typeof todayHeader.scrollIntoView === 'function') {
      todayHeader.scrollIntoView({ behavior: 'instant', inline: 'start', block: 'nearest' });
    } else {
      const iconCorner = wrapper.querySelector<HTMLElement>('.calendar-corner-icon');
      const stickyWidth = iconCorner ? iconCorner.getBoundingClientRect().width : 0;
      const offset = todayHeader.getBoundingClientRect().left - wrapper.getBoundingClientRect().left - stickyWidth;
      wrapper.scrollLeft += offset;
    }
    this.isHorizontallyScrolled.set(wrapper.scrollLeft > 0);
  }

  nextWeek(): void {
    this.weekOffset.update((w) => w + 1);
  }

  getCellEntries(date: string, mealSlot: MealSlot): CellEntryViewModel[] {
    return this.cellEntriesMap().get(`${date}__${mealSlot}`) || [];
  }

  async onEntryDrop(
    event: CdkDragDrop<
      { date: string; mealSlot: MealSlot },
      { date: string; mealSlot: MealSlot },
      CellEntryViewModel | AlertDragItem
    >,
  ): Promise<void> {
    if (!this.isDesktop()) return;

    const dragData = event.item.data;
    if (!dragData) return;

    const target = event.container.data;

    if ('kind' in dragData && dragData.kind === 'alert') {
      const alertItem = dragData.item;
      const slotLabel = this.mealSlots.find((s) => s.key === target.mealSlot)?.label ?? target.mealSlot;
      const created = await this.api.addMealPlanEntry({
        date: target.date,
        mealSlot: target.mealSlot,
        productId: alertItem.productId,
        sortOrder: event.currentIndex,
      });
      this.entries.update((list) => [...list, created]);

      this.undoService.register({
        description: `Added ${alertItem.productName} to ${slotLabel}`,
        onUndo: async () => {
          await this.api.deleteMealPlanEntry(created.id);
          this.entries.update((list) => list.filter((e) => e.id !== created.id));
        },
      });
      return;
    }

    const item = dragData as CellEntryViewModel;
    const isSameCell = event.previousContainer === event.container;

    if (isSameCell) {
      if (event.previousIndex === event.currentIndex) return;
      const cellItems = [...this.getCellEntries(target.date, target.mealSlot)];
      moveItemInArray(cellItems, event.previousIndex, event.currentIndex);

      const orderMap = new Map(cellItems.map((vm, idx) => [vm.entry.id, idx]));
      const nowIso = new Date().toISOString();
      this.entries.update((list) =>
        list.map((e) => (orderMap.has(e.id) ? { ...e, sortOrder: orderMap.get(e.id)!, updatedAt: nowIso } : e)),
      );

      await Promise.all(
        cellItems.map((vm, idx) => this.api.updateMealPlanEntry(vm.entry.id, { sortOrder: idx })),
      );
      return;
    }

    const newSortOrder = event.currentIndex;
    const nowIso = new Date().toISOString();
    this.entries.update((list) =>
      list.map((e) =>
        e.id === item.entry.id
          ? { ...e, date: target.date, mealSlot: target.mealSlot, sortOrder: newSortOrder, updatedAt: nowIso }
          : e,
      ),
    );

    await this.api.updateMealPlanEntry(item.entry.id, {
      date: target.date,
      mealSlot: target.mealSlot,
      sortOrder: newSortOrder,
    });
  }

  async deleteEntryFromContextMenu(item: CellEntryViewModel): Promise<void> {
    const removed = item.entry;
    const slotLabel = this.mealSlots.find((s) => s.key === removed.mealSlot)?.label ?? removed.mealSlot;

    await this.api.deleteMealPlanEntry(removed.id);
    this.entries.update((list) => list.filter((e) => e.id !== removed.id));

    this.undoService.register({
      description: `Removed ${item.productName} from ${slotLabel}`,
      onUndo: async () => {
        const restored = await this.api.addMealPlanEntry({
          date: removed.date,
          mealSlot: removed.mealSlot,
          productId: removed.productId,
          sortOrder: removed.sortOrder,
        });
        this.entries.update((list) => [...list, restored]);
      },
    });
  }

  openSlotModal(day: WeekDayColumn, slot: MealSlotConfig): void {
    const slotEntries = this.entries().filter((e) => e.date === day.date && e.mealSlot === slot.key);

    const ref = this.dialog.open(PlannerSlotModalComponent, {
      disableClose: false,
      data: {
        date: day.date,
        dateLabel: day.dateLabel,
        mealSlot: slot.key,
        mealSlotLabel: slot.label,
        entries: slotEntries,
        stock: this.stock(),
        products: this.products(),
        locations: this.locations(),
        productGroups: this.productGroups(),
        units: this.units(),
        savedFilters: this.savedFilters(),
        members: this.members(),
        expiringSoonDays: this.expiringSoonDays(),
      },
    });

    firstValueFrom(ref.closed)
      .then((res: any) => {
        if (res?.refreshed) {
          this.refreshEntriesAndStock();
        }
      })
      .catch(() => {});
  }

  toggleAlertsSidebar(): void {
    this.isAlertsSidebarOpen.update((open) => !open);
  }

  closeAlertsSidebar(): void {
    this.isAlertsSidebarOpen.set(false);
  }

  async openAlertProductActionModal(item: NextItemDto): Promise<void> {
    const product =
      this.products().find((p) => p.id === item.productId) || (await this.api.getProduct(item.productId).catch(() => null));
    if (!product) return;

    const stores = await this.api.getStores().catch(() => []);
    const ref = this.dialog.open(PantryActionModalComponent, {
      disableClose: true,
      data: {
        product,
        stockItems: this.stock(),
        locations: this.locations(),
        stores,
        units: this.units(),
        allProducts: this.products(),
        productGroups: this.productGroups(),
      },
    });

    const result = await firstValueFrom(ref.closed).catch(() => null);
    if (result && typeof result === 'object' && (result as { refreshed?: boolean }).refreshed) {
      await this.refreshEntriesAndStock();
    }
  }
}
