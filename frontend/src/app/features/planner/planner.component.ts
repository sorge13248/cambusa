import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucidePlus,
} from '@lucide/angular';
import {
  HouseholdMemberDto,
  Location,
  MEAL_SLOTS,
  MealPlanEntry,
  MealSlot,
  MealSlotConfig,
  Product,
  ProductGroup,
  QuantityUnit,
  SavedFilter,
  StockItem,
} from '../../core/models.js';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import { SyncService } from '../../core/sync.service.js';
import { compareByName } from '../../core/sorting.utils.js';
import { PlannerSlotModalComponent } from './planner-slot-modal/planner-slot-modal.component.js';

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
    LucideChevronLeft,
    LucideChevronRight,
    LucidePlus,
  ],
  templateUrl: './planner.component.html',
  styleUrl: './planner.component.scss',
})
export class PlannerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);
  private readonly dialog = inject(Dialog);

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

  private lastLoadedHouseholdId: string | null = null;
  private lastSyncCounter = 0;

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
  }

  nextWeek(): void {
    this.weekOffset.update((w) => w + 1);
  }

  getCellEntries(date: string, mealSlot: MealSlot): CellEntryViewModel[] {
    return this.cellEntriesMap().get(`${date}__${mealSlot}`) || [];
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
}
