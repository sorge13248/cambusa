import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { MealieLinkModalComponent, MealieLinkModalData } from './mealie-link-modal.component.js';
import { ApiService } from '../../../core/api.service.js';

describe('MealieLinkModalComponent', () => {
  let component: MealieLinkModalComponent;
  let fixture: ComponentFixture<MealieLinkModalComponent>;

  const mockDialogRef = {
    close: vi.fn(),
  };

  const mockApiService = {
    getMealieFoods: vi.fn(),
    getMealieRecipes: vi.fn(),
  };

  const modalData: MealieLinkModalData = {
    mode: 'food',
    alreadyLinkedIds: ['food-1'],
  };

  beforeEach(async () => {
    mockApiService.getMealieFoods.mockResolvedValue({
      items: [
        { id: 'food-1', name: 'Apples', description: 'Fresh organic' },
        { id: 'food-2', name: 'Bananas', description: null },
      ],
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14400000).toISOString(),
    });

    await TestBed.configureTestingModule({
      imports: [MealieLinkModalComponent],
      providers: [
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: DIALOG_DATA, useValue: modalData },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MealieLinkModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates and loads foods on init', async () => {
    expect(component).toBeTruthy();
    await fixture.whenStable();
    expect(mockApiService.getMealieFoods).toHaveBeenCalledWith(false);
    expect(component.allItems().length).toBe(2);
  });

  it('filters items based on searchQuery', async () => {
    await fixture.whenStable();
    component.searchQuery.set('ban');
    expect(component.filteredItems().length).toBe(1);
    expect(component.filteredItems()[0].name).toBe('Bananas');
  });

  it('marks already linked items as disabled', async () => {
    await fixture.whenStable();
    const item1 = component.filteredItems().find((i) => i.id === 'food-1');
    expect(item1?.isAlreadyLinked).toBe(true);

    // Clicking already linked item should not select it
    component.toggleItem(item1 as any);
    expect(component.selectedCount()).toBe(0);
  });

  it('toggles selection for valid items and confirms dialog with results array', async () => {
    await fixture.whenStable();
    const item2 = component.filteredItems().find((i) => i.id === 'food-2');
    expect(item2).toBeTruthy();

    component.toggleItem(item2 as any);
    expect(component.selectedCount()).toBe(1);
    expect(component.isItemSelected('food-2')).toBe(true);

    component.confirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith([
      {
        id: 'food-2',
        name: 'Bananas',
        slug: undefined,
      },
    ]);
  });

  it('allows deselecting and clearing selected items', async () => {
    await fixture.whenStable();
    const item2 = component.filteredItems().find((i) => i.id === 'food-2');
    component.toggleItem(item2 as any);
    expect(component.selectedCount()).toBe(1);

    component.deselectItem('food-2');
    expect(component.selectedCount()).toBe(0);

    component.toggleItem(item2 as any);
    expect(component.selectedCount()).toBe(1);
    component.clearSelection();
    expect(component.selectedCount()).toBe(0);
  });

  it('triggers force refresh when requested', async () => {
    await component.loadItems(true);
    expect(mockApiService.getMealieFoods).toHaveBeenCalledWith(true);
  });
});
