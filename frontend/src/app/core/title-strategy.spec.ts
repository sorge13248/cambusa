import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, PRIMARY_OUTLET, RouterStateSnapshot } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { CambusaTitleStrategy } from './title-strategy.js';

describe('CambusaTitleStrategy', () => {
  let strategy: CambusaTitleStrategy;
  let titleService: Title;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CambusaTitleStrategy, Title],
    });
    strategy = TestBed.inject(CambusaTitleStrategy);
    titleService = TestBed.inject(Title);
  });

  it('should set title with " — Cambusa" suffix when route title is present', () => {
    const childRoute = {
      outlet: PRIMARY_OUTLET,
      data: {},
      title: 'Pantry',
      children: [],
    } as unknown as ActivatedRouteSnapshot;

    const mockSnapshot = {
      root: {
        outlet: PRIMARY_OUTLET,
        children: [childRoute],
        data: {},
      },
    } as unknown as RouterStateSnapshot;

    strategy.updateTitle(mockSnapshot);
    expect(titleService.getTitle()).toBe('Pantry — Cambusa');
  });

  it('should not duplicate "Cambusa" suffix if already included in route title', () => {
    const childRoute = {
      outlet: PRIMARY_OUTLET,
      data: {},
      title: 'Pantry — Cambusa',
      children: [],
    } as unknown as ActivatedRouteSnapshot;

    const mockSnapshot = {
      root: {
        outlet: PRIMARY_OUTLET,
        children: [childRoute],
        data: {},
      },
    } as unknown as RouterStateSnapshot;

    strategy.updateTitle(mockSnapshot);
    expect(titleService.getTitle()).toBe('Pantry — Cambusa');
  });

  it('should fallback to default title if route title is empty or null', () => {
    const mockSnapshot = {
      root: {
        outlet: PRIMARY_OUTLET,
        children: [],
        data: {},
      },
    } as unknown as RouterStateSnapshot;

    strategy.updateTitle(mockSnapshot);
    expect(titleService.getTitle()).toBe('Cambusa — Smart Home Pantry & Grocery Management');
  });
});
