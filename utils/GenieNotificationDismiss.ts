/**
 * GenieNotificationDismiss — efeito Gênio (Dock macOS) para notificações.
 *
 * Não usa scale/fade/slide genéricos. Deforma a geometria em faixas horizontais
 * sincronizadas (um único relógio rAF), formando um funil elástico assimétrico
 * em direção a um destino configurável (`genieOrigin`).
 */

export type GeniePoint = { x: number; y: number };

/** Destino da “sucção” — configurável (ícone, canto, barra, etc.). */
export type GenieOrigin =
  | { type: 'element'; element: HTMLElement }
  | { type: 'point'; point: GeniePoint }
  | { type: 'selector'; selector: string };

export type GenieNotificationDismissOptions = {
  source: HTMLElement;
  /** Ponto/elemento para onde a notificação será sugada. */
  genieOrigin: GenieOrigin;
  /** Duração em ms (padrão ~520). */
  durationMs?: number;
  /** Faixas horizontais da malha (padrão 40). */
  stripCount?: number;
  /** Mantém o original invisível ao terminar (evita flash antes do unmount). */
  leaveSourceHidden?: boolean;
};

export type GenieNotificationDismissManyOptions = {
  sources: HTMLElement[];
  genieOrigin: GenieOrigin;
  durationMs?: number;
  staggerMs?: number;
  stripCount?: number;
  leaveSourcesHidden?: boolean;
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smoothstep cúbico. */
function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Ease estilo macOS (aceleração suave + desaceleração no pouso).
 * Evita linear / bounce exagerado.
 */
function appleEase(t: number): number {
  const x = clamp(t, 0, 1);
  // curva próxima de ease-in-out-cubic, um pouco mais “pesada” no início
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Bezier quadrática (curva característica do Genie). */
function quadBezier(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

export function resolveGenieOrigin(origin: GenieOrigin): GeniePoint | null {
  if (typeof document === 'undefined') return null;
  if (origin.type === 'point') {
    const { x, y } = origin.point;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }
  let el: HTMLElement | null = null;
  if (origin.type === 'element') {
    el = origin.element?.isConnected ? origin.element : null;
  } else {
    el = document.querySelector(origin.selector);
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

type StripNode = {
  wrap: HTMLDivElement;
  yNorm: number;
  originCenterX: number;
  originCenterY: number;
  originWidth: number;
  originHeight: number;
};

/**
 * Progresso local da faixa: a região mais perto do destino “entra” primeiro.
 * `leadFromTop` = true quando o alvo está acima do card.
 */
function stripLocalProgress(globalT: number, yNorm: number, leadFromTop: boolean): number {
  const lead = leadFromTop ? yNorm : 1 - yNorm;
  // atraso progressivo ao longo da altura (superfície elástica)
  const lag = lead * 0.42;
  return smoothstep((globalT - lag) / Math.max(0.001, 1 - lag * 0.85));
}

/**
 * Fator de largura do funil (não-uniforme): começa largo e afunila até ~0.
 * Faixas à frente (mais perto do destino) ficam mais estreitas primeiro.
 */
function funnelWidthFactor(localT: number): number {
  const e = appleEase(localT);
  // potência > 1: permanece “inteiro” no início, depois colapsa (não é scale uniforme)
  return Math.max(0.012, Math.pow(1 - e, 1.72));
}

function funnelStretchY(localT: number): number {
  // alongamento elástico no meio do trajeto, compressão no final
  if (localT < 0.35) return 1 + localT * 0.85;
  if (localT < 0.7) return 1.3 - (localT - 0.35) * 0.55;
  return Math.max(0.06, 1.1 - appleEase(localT) * 1.05);
}

function buildStrips(
  layer: HTMLElement,
  source: HTMLElement,
  rect: DOMRect,
  stripCount: number
): StripNode[] {
  const strips = Math.max(16, Math.min(64, stripCount));
  const stripH = rect.height / strips;
  const nodes: StripNode[] = [];

  for (let i = 0; i < strips; i++) {
    const top = rect.top + i * stripH;
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed',
      `left:${rect.left}px`,
      `top:${top}px`,
      `width:${rect.width}px`,
      `height:${stripH + 0.6}px`,
      'margin:0',
      'overflow:hidden',
      'pointer-events:none',
      'will-change:transform,opacity,filter',
      'backface-visibility:hidden',
      'transform-origin:50% 50%',
    ].join(';');

    const inner = source.cloneNode(true) as HTMLElement;
    inner.style.cssText = [
      'position:absolute',
      'left:0',
      `top:${-i * stripH}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      'margin:0',
      'transform:none',
      'opacity:1',
      'pointer-events:none',
      'box-shadow:none',
      'filter:none',
    ].join(';');
    inner.querySelectorAll('button, [tabindex], a').forEach((node) => {
      const el = node as HTMLElement;
      el.removeAttribute('tabindex');
      if (el instanceof HTMLButtonElement) el.disabled = true;
      el.style.pointerEvents = 'none';
    });

    wrap.appendChild(inner);
    layer.appendChild(wrap);

    nodes.push({
      wrap,
      yNorm: strips <= 1 ? 0.5 : i / (strips - 1),
      originCenterX: rect.left + rect.width / 2,
      originCenterY: top + stripH / 2,
      originWidth: rect.width,
      originHeight: stripH,
    });
  }

  return nodes;
}

function applyStripFrame(
  node: StripNode,
  globalT: number,
  target: GeniePoint,
  leadFromTop: boolean
): void {
  const localT = stripLocalProgress(globalT, node.yNorm, leadFromTop);
  const moveT = appleEase(localT);

  // Controle da curva Genie (puxa em arco antes de convergência)
  const ctrlX = lerp(node.originCenterX, target.x, 0.28);
  const ctrlY = lerp(node.originCenterY, target.y, 0.12) + (leadFromTop ? -18 : 18);
  const cx = quadBezier(node.originCenterX, ctrlX, target.x, moveT);
  const cy = quadBezier(node.originCenterY, ctrlY, target.y, moveT);

  const widthF = funnelWidthFactor(localT);
  const stretchY = funnelStretchY(localT);
  const dx = cx - node.originCenterX;
  const dy = cy - node.originCenterY;

  // leve cisalhamento elástico em direção ao funil
  const skew = (1 - widthF) * (target.x >= node.originCenterX ? -7 : 7) * (1 - moveT);

  // opacidade só no final do colapso (não é fade da animação)
  const opacity = localT < 0.88 ? 1 : 1 - ((localT - 0.88) / 0.12);
  const blur = localT > 0.75 ? (localT - 0.75) * 6 : 0;

  node.wrap.style.transform = `translate(${dx}px, ${dy}px) scale(${widthF}, ${stretchY}) skewX(${skew}deg)`;
  node.wrap.style.opacity = String(clamp(opacity, 0, 1));
  node.wrap.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none';
  // origem no centro da faixa — scaleX comprime para o eixo do funil
  node.wrap.style.transformOrigin = '50% 50%';
}

function pulseTarget(targetEl: HTMLElement | null, durationMs: number): void {
  if (!targetEl?.isConnected) return;
  try {
    targetEl.animate(
      [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(1)', offset: 0.55 },
        { transform: 'scale(1.16)', offset: 0.72 },
        { transform: 'scale(0.94)', offset: 0.86 },
        { transform: 'scale(1)', offset: 1 },
      ],
      { duration: durationMs, easing: 'cubic-bezier(0.33, 1.2, 0.4, 1)' }
    );
  } catch {
    /* ignore */
  }
}

/**
 * Anima uma notificação com efeito Genie até `genieOrigin`.
 * Resolve quando a animação termina.
 */
export async function GenieNotificationDismiss(
  opts: GenieNotificationDismissOptions
): Promise<void> {
  const source = opts.source;
  if (!source?.isConnected) return;

  const target = resolveGenieOrigin(opts.genieOrigin);
  if (!target) return;

  if (prefersReducedMotion()) {
    if (opts.leaveSourceHidden) source.style.opacity = '0';
    await new Promise<void>((r) => window.setTimeout(r, 80));
    return;
  }

  const durationMs = clamp(opts.durationMs ?? 520, 320, 900);
  const stripCount = opts.stripCount ?? 40;
  const rect = source.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;

  const leadFromTop = target.y < rect.top + rect.height * 0.5;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('data-genie-notification-dismiss', 'true');
  layer.style.cssText =
    'position:fixed;inset:0;z-index:100200;pointer-events:none;overflow:visible;';
  document.body.appendChild(layer);

  const prevOpacity = source.style.opacity;
  source.style.opacity = '0';

  const strips = buildStrips(layer, source, rect, stripCount);

  // frame 0: visualmente inteiro (ainda sem deformação)
  for (const s of strips) applyStripFrame(s, 0, target, leadFromTop);

  const targetEl =
    opts.genieOrigin.type === 'element'
      ? opts.genieOrigin.element
      : opts.genieOrigin.type === 'selector'
        ? document.querySelector<HTMLElement>(opts.genieOrigin.selector)
        : null;
  pulseTarget(targetEl, durationMs + 80);

  await new Promise<void>((resolve) => {
    const t0 = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const raw = (now - t0) / durationMs;
      const globalT = clamp(raw, 0, 1);
      for (const s of strips) applyStripFrame(s, globalT, target, leadFromTop);
      if (globalT < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(raf);
        resolve();
      }
    };

    raf = requestAnimationFrame(tick);
  });

  if (!opts.leaveSourceHidden && source.isConnected) {
    source.style.opacity = prevOpacity;
  }
  layer.remove();
}

/** Várias notificações em sequência (minimize / limpar visual). */
export async function GenieNotificationDismissMany(
  opts: GenieNotificationDismissManyOptions
): Promise<void> {
  const sources = opts.sources.filter((el) => el?.isConnected);
  if (sources.length === 0) return;
  const stagger = Math.max(0, opts.staggerMs ?? 48);

  if (sources.length === 1) {
    await GenieNotificationDismiss({
      source: sources[0],
      genieOrigin: opts.genieOrigin,
      durationMs: opts.durationMs,
      stripCount: opts.stripCount,
      leaveSourceHidden: opts.leaveSourcesHidden,
    });
    return;
  }

  // Paralelo com atraso: cada card começa um pouco depois do anterior.
  await Promise.all(
    sources.map(
      (source, i) =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            void GenieNotificationDismiss({
              source,
              genieOrigin: opts.genieOrigin,
              durationMs: opts.durationMs,
              stripCount: opts.stripCount,
              leaveSourceHidden: opts.leaveSourcesHidden,
            }).finally(resolve);
          }, i * stagger);
        })
    )
  );
}

/** Atalhos de origem comuns no shell PC. */
export function genieOriginFromElement(el: HTMLElement | null | undefined): GenieOrigin | null {
  if (!el?.isConnected) return null;
  return { type: 'element', element: el };
}

export function genieOriginFromSelector(selector: string): GenieOrigin {
  return { type: 'selector', selector };
}

export function genieOriginFromPoint(x: number, y: number): GenieOrigin {
  return { type: 'point', point: { x, y } };
}
