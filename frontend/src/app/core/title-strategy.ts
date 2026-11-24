import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class CambusaTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override getResolvedTitleForRoute(snapshot: ActivatedRouteSnapshot): any {
    return (
      super.getResolvedTitleForRoute(snapshot) ??
      snapshot.title ??
      snapshot.routeConfig?.title ??
      snapshot.data?.['title']
    );
  }

  override updateTitle(routerState: RouterStateSnapshot): void {
    const routeTitle = this.buildTitle(routerState);
    if (routeTitle) {
      this.title.setTitle(routeTitle.includes('Cambusa') ? routeTitle : `${routeTitle} — Cambusa`);
    } else {
      this.title.setTitle('Cambusa — Smart Home Pantry & Grocery Management');
    }
  }
}
