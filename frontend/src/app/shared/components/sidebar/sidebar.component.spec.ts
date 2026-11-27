import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SidebarComponent } from './sidebar.component.js';

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;
  let component: SidebarComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    document.body.classList.remove('has-push-sidebar-right', 'has-push-sidebar-left');
    document.documentElement.style.removeProperty('--sidebar-push-right');
    document.documentElement.style.removeProperty('--sidebar-push-left');
  });

  it('should default backdrop to true and render backdrop when open', () => {
    expect(component.backdrop()).toBe(true);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('title', 'Test Sidebar');
    fixture.detectChanges();

    const backdrop = fixture.nativeElement.querySelector('.sidebar-backdrop') as HTMLElement;
    const panel = fixture.nativeElement.querySelector('.sidebar-panel') as HTMLElement;
    expect(backdrop).toBeTruthy();
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain('Test Sidebar');
    expect(document.body.classList.contains('has-push-sidebar-right')).toBe(false);
  });

  it('should emit closed when backdrop or close button is clicked', () => {
    const spy = vi.spyOn(component.closed, 'emit');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const backdrop = fixture.nativeElement.querySelector('.sidebar-backdrop') as HTMLElement;
    backdrop.click();
    expect(spy).toHaveBeenCalledTimes(1);

    const closeBtn = fixture.nativeElement.querySelector('.sidebar-close-btn') as HTMLButtonElement;
    closeBtn.click();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should not render backdrop and should push page content when backdrop is false', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('backdrop', false);
    fixture.componentRef.setInput('width', '400px');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.sidebar-backdrop')).toBeNull();
    expect(document.body.classList.contains('has-push-sidebar-right')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--sidebar-push-right')).toBe('400px');

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(document.body.classList.contains('has-push-sidebar-right')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--sidebar-push-right')).toBe('');
  });

  it('should clean up push layout classes on destroy', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('backdrop', false);
    fixture.detectChanges();
    expect(document.body.classList.contains('has-push-sidebar-right')).toBe(true);

    fixture.destroy();
    expect(document.body.classList.contains('has-push-sidebar-right')).toBe(false);
  });
});
