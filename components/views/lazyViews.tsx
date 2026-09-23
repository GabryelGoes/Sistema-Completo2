import { lazyWithRetry } from '../../utils/lazyWithRetry';

export const LazyReceptionView = lazyWithRetry(() =>
  import('./ReceptionView').then((m) => ({ default: m.ReceptionView }))
);
export const LazyPatioView = lazyWithRetry(() =>
  import('./PatioView').then((m) => ({ default: m.PatioView }))
);
export const LazyAgendaView = lazyWithRetry(() =>
  import('./AgendaView').then((m) => ({ default: m.AgendaView }))
);
export const LazyBudgetsHubView = lazyWithRetry(() =>
  import('./BudgetsHubView').then((m) => ({ default: m.BudgetsHubView }))
);
export const LazyReportsView = lazyWithRetry(() =>
  import('./ReportsView').then((m) => ({ default: m.ReportsView }))
);
export const LazyErrorBulletinView = lazyWithRetry(() =>
  import('./ErrorBulletinView').then((m) => ({ default: m.ErrorBulletinView }))
);
export const LazyQualityRadarView = lazyWithRetry(() =>
  import('./QualityRadarView').then((m) => ({ default: m.QualityRadarView }))
);
