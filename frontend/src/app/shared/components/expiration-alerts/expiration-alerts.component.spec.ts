import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExpirationAlertsComponent } from './expiration-alerts.component.js';
import { NextItemDto } from '../../../core/models.js';

describe('ExpirationAlertsComponent', () => {
  let fixture: ComponentFixture<ExpirationAlertsComponent>;
  let component: ExpirationAlertsComponent;

  const expiredItem: NextItemDto = {
    id: 'exp-1',
    productId: 'prod-1',
    productName: 'Organic Milk',
    productPictureFileName: 'milk.webp',
    amount: 1,
    quantityUnit: 'bottle',
    location: 'Fridge',
    bestBeforeDate: '2026-11-20',
    isOpened: true,
    daysOverdue: 3,
  };

  const expiringItem: NextItemDto = {
    id: 'soon-1',
    productId: 'prod-2',
    productName: 'Cheddar Cheese',
    productPictureFileName: null,
    amount: 2,
    quantityUnit: 'pack',
    location: 'Fridge',
    bestBeforeDate: '2026-11-25',
    isOpened: false,
    daysRemaining: 2,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpirationAlertsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExpirationAlertsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('expired', [expiredItem]);
    fixture.componentRef.setInput('expiringSoon', [expiringItem]);
    fixture.componentRef.setInput('configuredDays', 5);
    fixture.detectChanges();
  });

  it('should render expired and expiring soon sections with items', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Expired Products (1)');
    expect(el.textContent).toContain('Organic Milk');
    expect(el.textContent).toContain('Expired 3d ago');
    expect(el.textContent).toContain('Expiring Soon (1)');
    expect(el.textContent).toContain('Cheddar Cheese');
    expect(el.textContent).toContain('Expires in 2 days');
  });

  it('should render empty states when lists are empty', () => {
    fixture.componentRef.setInput('expired', []);
    fixture.componentRef.setInput('expiringSoon', []);
    fixture.componentRef.setInput('configuredDays', 7);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No expired products!');
    expect(el.textContent).toContain('Nothing expiring soon!');
    expect(el.textContent).toContain('within 7 days');
  });

  it('should apply layout-stacked class when layout is stacked', () => {
    fixture.componentRef.setInput('layout', 'stacked');
    fixture.detectChanges();

    const grid = fixture.nativeElement.querySelector('.alerts-grid');
    expect(grid.classList.contains('layout-stacked')).toBe(true);
  });

  it('should emit itemSelected when an item card is clicked', () => {
    const spy = vi.spyOn(component.itemSelected, 'emit');
    const card = fixture.nativeElement.querySelector('.item-expired') as HTMLElement;
    card.click();
    expect(spy).toHaveBeenCalledWith(expiredItem);
  });

  it('should mark cards as draggable when draggable input is true', () => {
    fixture.componentRef.setInput('draggable', true);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.item-expired') as HTMLElement;
    expect(card.classList.contains('is-draggable')).toBe(true);
  });

  it('should not emit itemSelected on click immediately after drag ends', () => {
    const spy = vi.spyOn(component.itemSelected, 'emit');
    component.onDragStarted();
    component.onDragEnded();

    const card = fixture.nativeElement.querySelector('.item-expired') as HTMLElement;
    card.click();
    expect(spy).not.toHaveBeenCalled();
  });
});
