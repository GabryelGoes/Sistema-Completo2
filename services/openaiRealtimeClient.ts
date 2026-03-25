/**
 * Cliente WebSocket mínimo para OpenAI Realtime API (áudio + ferramentas).
 * @see https://platform.openai.com/docs/guides/realtime-websocket
 */

const SAMPLE_RATE = 24000;

class Pcm24kPlayer {
  private ctx: AudioContext | null = null;
  private nextTime = 0;

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    return this.ctx;
  }

  playBase64Pcm16(base64: string): void {
    const ctx = this.ensureContext();
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.byteLength < 2) return;
    const samples = Math.floor(bytes.byteLength / 2);
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, samples);
    const float32 = new Float32Array(samples);
    for (let i = 0; i < samples; i++) float32[i] = int16[i]! / 32768;
    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const start = Math.max(ctx.currentTime, this.nextTime);
    src.start(start);
    this.nextTime = start + buffer.duration;
  }

  resetSchedule(): void {
    if (this.ctx) this.nextTime = this.ctx.currentTime;
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.nextTime = 0;
  }
}

export interface OpenAiRealtimeClientHandlers {
  onSessionReady: () => void;
  onAssistantTranscriptDelta: (delta: string) => void;
  onAssistantTranscriptDone: () => void;
  onResponseDone: () => void;
  onFunctionCall: (ev: { name: string; arguments: string; call_id: string }) => Promise<string>;
  onError: (message: string) => void;
}

export class OpenAiRealtimeClient {
  private ws: WebSocket | null = null;
  private readonly player = new Pcm24kPlayer();
  private handlers: OpenAiRealtimeClientHandlers;
  private toolChain: Promise<void> = Promise.resolve();

  constructor(handlers: OpenAiRealtimeClientHandlers) {
    this.handlers = handlers;
  }

  connect(clientSecret: string, model: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
      let settled = false;
      try {
        const ws = new WebSocket(url, ["realtime", `openai-insecure-api-key.${clientSecret}`]);
        this.ws = ws;
        ws.onopen = () => {
          /* aguarda session.created */
        };
        ws.onerror = () => {
          if (!settled) {
            settled = true;
            reject(new Error("Falha na conexão WebSocket com a OpenAI."));
          }
          this.handlers.onError("Erro na conexão Realtime.");
        };
        ws.onclose = () => {
          this.ws = null;
        };
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
            const typ = data.type;
            if (typ === "error") {
              const errObj = data.error as { message?: string } | undefined;
              const msg = errObj?.message || "Erro na sessão Realtime.";
              if (!settled) {
                settled = true;
                reject(new Error(msg));
              }
              this.handlers.onError(msg);
              return;
            }
            if (typ === "session.created" || typ === "session.updated") {
              if (!settled) {
                settled = true;
                resolve();
              }
              this.handlers.onSessionReady();
              return;
            }
            this.handleServerEvent(data);
          } catch {
            /* ignore */
          }
        };
      } catch (e) {
        reject(e instanceof Error ? e : new Error("WebSocket indisponível."));
      }
    });
  }

  private handleServerEvent(data: Record<string, unknown>): void {
    const t = data.type;
    if (t === "response.output_audio.delta") {
      const delta = data.delta;
      if (typeof delta === "string") this.player.playBase64Pcm16(delta);
      return;
    }
    if (t === "response.output_audio_transcript.delta") {
      const delta = data.delta;
      if (typeof delta === "string") this.handlers.onAssistantTranscriptDelta(delta);
      return;
    }
    if (t === "response.output_audio_transcript.done") {
      this.handlers.onAssistantTranscriptDone();
      return;
    }
    if (t === "response.done") {
      this.handlers.onResponseDone();
      return;
    }
    if (t === "response.function_call_arguments.done") {
      const name = data.name;
      const args = data.arguments;
      const callId = data.call_id;
      if (
        typeof name === "string" &&
        typeof args === "string" &&
        typeof callId === "string"
      ) {
        this.enqueueTool(name, args, callId);
      }
      return;
    }
    if (t === "error") {
      const err = data.error as { message?: string } | undefined;
      this.handlers.onError(err?.message || "Erro Realtime.");
      return;
    }
  }

  private enqueueTool(name: string, args: string, call_id: string): void {
    this.toolChain = this.toolChain.then(async () => {
      try {
        const output = await this.handlers.onFunctionCall({ name, arguments: args, call_id });
        this.sendJson({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id,
            output,
          },
        });
        this.sendJson({ type: "response.create" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao executar ferramenta.";
        this.sendJson({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id,
            output: JSON.stringify({ ok: false, error: msg }),
          },
        });
        this.sendJson({ type: "response.create" });
      }
    });
  }

  sendUserText(text: string): void {
    this.player.resetSchedule();
    this.sendJson({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    this.sendJson({ type: "response.create" });
  }

  private sendJson(payload: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  disconnect(): void {
    this.player.dispose();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }
}
