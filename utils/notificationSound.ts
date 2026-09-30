/**
 * Sons de notificação (Web Audio API).
 * - Comentários: dois tons ascendentes (C5 → E5) — toque de mensagem.
 * - Orçamentos: arpejo G4–C5–E5 (playBudgetCreatedOrEditedSound).
 * - Outras: toque grave curto D4 → F4.
 */
let audioContext: AudioContext | null = null;

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Som para novo comentário — blob de mensagem (dois bipos curtos + leve eco),
 * distinto do arpejo de orçamento.
 */
export function playNotificationSound(): void {
  try {
    const ctx = getContext();
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const freqs = [587.33, 783.99]; // D5 → G5 — mais agudo/“mensagem” que o arpejo de orçamento
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = now + i * 0.11;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.14, t0 + 0.015);
      gain.gain.linearRampToValueAtTime(0.06, t0 + 0.09);
      gain.gain.linearRampToValueAtTime(0, t0 + 0.2);
      osc.start(t0);
      osc.stop(t0 + 0.22);
    });
  } catch {
    // Ignore errors (e.g. autoplay policy)
  }
}

/** Som para outras notificações (etapa, queixa, data de entrega, etc.) – tom mais grave. */
/** Som curto ao criar/editar orçamento no Pátio (hub de orçamentos). */
export function playBudgetCreatedOrEditedSound(): void {
  try {
    const ctx = getContext();
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const freqs = [392, 523.25, 659.25]; // G4, C5, E5 — leve, distinto do toque de comentário
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = now + i * 0.07;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.11, t0 + 0.018);
      gain.gain.linearRampToValueAtTime(0.04, t0 + 0.12);
      gain.gain.linearRampToValueAtTime(0, t0 + 0.22);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    });
  } catch {
    // autoplay / permissões
  }
}

export function playOtherNotificationSound(): void {
  try {
    const ctx = getContext();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(293.66, now);   // D4
    osc.frequency.setValueAtTime(349.23, now + 0.1); // F4
    osc.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.25);
    gain.gain.linearRampToValueAtTime(0, now + 0.35);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Ignore errors (e.g. autoplay policy)
  }
}
