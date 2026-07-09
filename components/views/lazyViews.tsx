import { lazy } from 'react';

export const LazyReceptionView = lazy(() =>
  import('./ReceptionView').then((m) => ({ default: m.ReceptionView }))
);
export const LazyPatioView = lazy(() => import('./PatioView').then((m) => ({ default: m.PatioView })));
export const LazyAgendaView = lazy(() => import('./AgendaView').then((m) => ({ default: m.AgendaView })));
export const LazyBudgetsHubView = lazy(() =>
  import('./BudgetsHubView').then((m) => ({ default: m.BudgetsHubView }))
);
export const LazyReportsView = lazy(() => import('./ReportsView').then((m) => ({ default: m.ReportsView })));
export const LazyErrorBulletinView = lazy(() =>
  import('./ErrorBulletinView').then((m) => ({ default: m.ErrorBulletinView }))
);
export const LazyQualityRadarView = lazy(() =>
  import('./QualityRadarView').then((m) => ({ default: m.QualityRadarView }))
);
