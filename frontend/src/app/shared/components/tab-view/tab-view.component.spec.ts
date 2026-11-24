import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabItem, TabViewComponent } from './tab-view.component.js';

describe('TabViewComponent', () => {
  let component: TabViewComponent<any>;
  let fixture: ComponentFixture<TabViewComponent<any>>;

  const mockTabs: TabItem[] = [
    { id: 'tab1', label: 'Tab One', icon: '📁' },
    { id: 'tab2', label: 'Tab Two', icon: '⚙️', badge: 3 },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TabViewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('tabs', mockTabs);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render all tabs and badges', () => {
    const buttons = fixture.nativeElement.querySelectorAll('.tab-view-btn');
    expect(buttons.length).toBe(2);

    const badge = fixture.nativeElement.querySelector('.tab-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent.trim()).toBe('3');
  });

  it('should emit tabChange when clicking tab', () => {
    const spy = vi.spyOn(component.tabChange, 'emit');
    const buttons = fixture.nativeElement.querySelectorAll('.tab-view-btn');
    buttons[1].click();

    expect(spy).toHaveBeenCalledWith('tab2');
    expect(component.activeTabId()).toBe('tab2');
  });

  it('should emit reordered tabs on drop', () => {
    const spy = vi.spyOn(component.reordered, 'emit');
    component.onDrop({
      previousIndex: 0,
      currentIndex: 1,
    } as any);

    expect(spy).toHaveBeenCalled();
  });

  it('should apply wrap class when wrap input is true', () => {
    fixture.componentRef.setInput('wrap', true);
    fixture.detectChanges();
    const nav = fixture.nativeElement.querySelector('.tab-view-container');
    expect(nav.classList.contains('wrap')).toBe(true);
  });
});
