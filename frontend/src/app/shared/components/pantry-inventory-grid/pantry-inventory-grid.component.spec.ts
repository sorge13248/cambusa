import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PantryInventoryGridComponent } from './pantry-inventory-grid.component.js';

describe('PantryInventoryGridComponent', () => {
  let component: PantryInventoryGridComponent;
  let fixture: ComponentFixture<PantryInventoryGridComponent>;

  const mockStock: any[] = [
    { id: 's1', productId: 'p1', productName: 'Pasta', amount: 2, bestBeforeDate: '2027-04-30', isOpen: false },
    { id: 's2', productId: 'p2', productName: 'Milk', amount: 1, bestBeforeDate: '2027-01-10', isOpen: true },
  ];

  const mockProducts: any[] = [
    { id: 'p1', name: 'Pasta', description: 'Durum wheat' },
    { id: 'p2', name: 'Milk', description: 'Whole milk' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PantryInventoryGridComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PantryInventoryGridComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('stock', mockStock);
    fixture.componentRef.setInput('products', mockProducts);
    fixture.componentRef.setInput('syncUrlParams', false);
    fixture.detectChanges();
  });

  it('should render pantry action controls in pantry mode', () => {
    fixture.componentRef.setInput('mode', 'pantry');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.stock-card').length).toBe(2);
    expect(el.querySelectorAll('.card-footer').length).toBe(2);
    expect(el.querySelectorAll('.card-expiry-section').length).toBe(2);
  });

  it('should hide quick-date-modifier and manage/open/consume buttons in picker mode', () => {
    fixture.componentRef.setInput('mode', 'picker');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.stock-card').length).toBe(2);
    expect(el.querySelectorAll('.card-footer').length).toBe(0);
    expect(el.querySelectorAll('.card-expiry-section').length).toBe(0);
  });

  it('should emit cardSelected when a card is clicked in picker mode', () => {
    fixture.componentRef.setInput('mode', 'picker');
    fixture.detectChanges();

    const spy = vi.spyOn(component.cardSelected, 'emit');
    const firstCard = fixture.nativeElement.querySelector('.stock-card') as HTMLElement;
    firstCard.click();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].productId).toBe('p2'); // Milk has earlier bestBeforeDate
  });

  it('should show active out-of-stock products in pantry mode with is-out-of-stock class and red badge', () => {
    fixture.componentRef.setInput('mode', 'pantry');
    fixture.componentRef.setInput('products', [
      ...mockProducts,
      { id: 'p3', name: 'Olive Oil', active: true },
      { id: 'p4', name: 'Archived Sauce', active: false },
    ]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const cards = Array.from(el.querySelectorAll('.stock-card')) as HTMLElement[];
    expect(cards.length).toBe(3);

    const outOfStockCards = el.querySelectorAll('.stock-card.is-out-of-stock');
    expect(outOfStockCards.length).toBe(1);
    expect(outOfStockCards[0].textContent).toContain('Olive Oil');

    const badge = outOfStockCards[0].querySelector('.badge-out-of-stock');
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toBe('Out of stock');

    // Out-of-stock card should not render quick-date-modifier and should disable Open 1 / Consume 1
    expect(outOfStockCards[0].querySelector('.card-expiry-section')).toBeNull();
    const buttons = Array.from(outOfStockCards[0].querySelectorAll('.footer-right button')) as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('should filter out-of-stock products when status filter is set to out_of_stock', () => {
    fixture.componentRef.setInput('mode', 'pantry');
    fixture.componentRef.setInput('products', [
      ...mockProducts,
      { id: 'p3', name: 'Olive Oil', active: true },
    ]);
    fixture.detectChanges();

    component.selectedStatus = 'out_of_stock';
    component.onFilterChange();
    fixture.detectChanges();

    expect(component.filteredStock().length).toBe(1);
    expect(component.filteredStock()[0].productId).toBe('p3');
  });

  it('should not show out-of-stock products in picker mode', () => {
    fixture.componentRef.setInput('mode', 'picker');
    fixture.componentRef.setInput('products', [
      ...mockProducts,
      { id: 'p3', name: 'Olive Oil', active: true },
    ]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.stock-card').length).toBe(2);
    expect(el.querySelectorAll('.stock-card.is-out-of-stock').length).toBe(0);
  });

  it('should not mark a parent product as out of stock when a child or grandchild has stock', () => {
    fixture.componentRef.setInput('mode', 'pantry');
    fixture.componentRef.setInput('stock', [
      { id: 's-leaf', productId: 'grandchild', productName: 'Cavendish', amount: 2, bestBeforeDate: '2027-05-01', isOpen: false },
    ]);
    fixture.componentRef.setInput('products', [
      { id: 'root', name: 'Fruit', active: true, parentProductId: null },
      { id: 'child', name: 'Bananas', active: true, parentProductId: 'root' },
      { id: 'grandchild', name: 'Cavendish', active: true, parentProductId: 'child' },
      { id: 'empty-root', name: 'Vegetables', active: true, parentProductId: null },
      { id: 'empty-child', name: 'Carrots', active: true, parentProductId: 'empty-root' },
    ]);
    fixture.detectChanges();

    const cards = component.filteredStock();
    expect(cards.find((c) => c.productId === 'root')).toBeUndefined();
    expect(cards.find((c) => c.productId === 'child')).toBeUndefined();
    expect(cards.find((c) => c.productId === 'grandchild')?.isOutOfStock).toBe(false);
    expect(cards.find((c) => c.productId === 'empty-root')?.isOutOfStock).toBe(true);
    expect(cards.find((c) => c.productId === 'empty-child')?.isOutOfStock).toBe(true);
  });
});
