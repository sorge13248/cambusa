import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuickDateModifierComponent } from './quick-date-modifier.component.js';

describe('QuickDateModifierComponent', () => {
  let component: QuickDateModifierComponent;
  let fixture: ComponentFixture<QuickDateModifierComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickDateModifierComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(QuickDateModifierComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with default label', () => {
    expect(component).toBeTruthy();
    expect(component.label()).toBe('Best Before:');
  });

  it('should emit date on adjust today', () => {
    let emittedDate: string | null = null;
    component.dateChange.subscribe((d) => (emittedDate = d));

    component.adjust('today');
    expect(emittedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
