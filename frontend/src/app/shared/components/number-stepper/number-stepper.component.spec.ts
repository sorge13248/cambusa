import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NumberStepperComponent } from './number-stepper.component';

describe('NumberStepperComponent', () => {
  let component: NumberStepperComponent;
  let fixture: ComponentFixture<NumberStepperComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NumberStepperComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NumberStepperComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initialize with default value 1', () => {
    expect(component).toBeTruthy();
    expect(component.value()).toBe(1);
  });

  it('should increment value on increment()', () => {
    component.increment();
    expect(component.value()).toBe(2);
  });

  it('should decrement value on decrement() down to min', () => {
    component.value.set(2);
    component.decrement();
    expect(component.value()).toBe(1);

    // Should not decrease below min (1)
    component.decrement();
    expect(component.value()).toBe(1);
  });

  it('should respect custom min and max clamping', () => {
    fixture.componentRef.setInput('min', 5);
    fixture.componentRef.setInput('max', 7);
    component.value.set(5);

    expect(component.isAtMin()).toBe(true);
    component.decrement();
    expect(component.value()).toBe(5);

    component.increment();
    expect(component.value()).toBe(6);

    component.increment();
    expect(component.value()).toBe(7);
    expect(component.isAtMax()).toBe(true);

    component.increment();
    expect(component.value()).toBe(7);
  });

  it('should handle manual input change and clamp', () => {
    fixture.componentRef.setInput('min', 1);
    fixture.componentRef.setInput('max', 10);

    const inputEl = fixture.nativeElement.querySelector('input');
    inputEl.value = '15';
    inputEl.dispatchEvent(new Event('change'));

    expect(component.value()).toBe(10);

    inputEl.value = '-5';
    inputEl.dispatchEvent(new Event('change'));

    expect(component.value()).toBe(1);
  });
});
