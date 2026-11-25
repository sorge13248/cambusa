import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { StarRatingComponent } from './star-rating.component.js';

describe('StarRatingComponent', () => {
  let component: StarRatingComponent;
  let fixture: ComponentFixture<StarRatingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StarRatingComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StarRatingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with null rating by default', () => {
    expect(component).toBeTruthy();
    expect(component.value()).toBeNull();
  });

  it('should set rating when clicking a star and NOT clear when clicking the same star again', () => {
    const buttons = fixture.nativeElement.querySelectorAll('.star-btn') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(5);

    buttons[3].click();
    fixture.detectChanges();
    expect(component.value()).toBe(4);

    // Clicking the already-assigned 4th star must keep it at 4
    buttons[3].click();
    fixture.detectChanges();
    expect(component.value()).toBe(4);
  });

  it('should clear rating only when clicking the Clear button', () => {
    component.value.set(5);
    fixture.detectChanges();

    const clearBtn = fixture.nativeElement.querySelector('.clear-rating-btn') as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    fixture.detectChanges();

    expect(component.value()).toBeNull();
  });

  it('should not allow interaction or show clear button in readonly mode', () => {
    fixture.componentRef.setInput('readonly', true);
    fixture.componentRef.setInput('value', 3);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.star-btn');
    const icons = fixture.nativeElement.querySelectorAll('.star-icon');
    const clearBtn = fixture.nativeElement.querySelector('.clear-rating-btn');

    expect(buttons.length).toBe(0);
    expect(icons.length).toBe(5);
    expect(clearBtn).toBeNull();

    component.selectStar(5);
    expect(component.value()).toBe(3);
  });
});
