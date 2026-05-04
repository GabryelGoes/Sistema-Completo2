/**
 * Sons de notificação (Web Audio API).
 * - Comentários: dois tons ascendentes (C5 → E5).
 * - Outras notificações: toque mais grave e curto (D4 → F4).
 */
let audioContext: AudioContext | null = null;

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

/** Som para novo comentário (tom mais agudo). */
export function playNotificationSound(): void {
  try {
    const ctx = getContext();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.setValueAtTime(659.25, now + 0.12); // E5
    osc1.connect(gain);

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(523.25, now);
    osc2.frequency.setValueAtTime(659.25, now + 0.12);
    osc2.connect(gain);

    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.2);
    gain.gain.linearRampToValueAtTime(0, now + 0.38);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.38);
    osc2.stop(now + 0.38);
    gain.gain.setValueAtTime(0, now + 0.38);
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
