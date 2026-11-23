import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CollapsibleSectionComponent } from './collapsible-section.component.js';

describe('CollapsibleSectionComponent', () => {
  let component: CollapsibleSectionComponent;
  let fixture: ComponentFixture<CollapsibleSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CollapsibleSectionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CollapsibleSectionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Basic Information');
    fixture.detectChanges();
  });

  it('should create and initialize collapsed by default', () => {
    expect(component).toBeTruthy();
    expect(component.isOpen()).toBe(false);
  });

  it('should toggle open and closed on click', () => {
    component.toggle();
    expect(component.isOpen()).toBe(true);
    component.toggle();
    expect(component.isOpen()).toBe(false);
  });
});
