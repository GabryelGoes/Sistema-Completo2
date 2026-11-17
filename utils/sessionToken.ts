/**
 * SEC-05.1.2-C.2: leitura do token de sessão.
 * A assinatura inválida não empresta identidade do corpo.
 * Token fora do prazo ou sem sid não autoriza.
 */
import crypto from "crypto";
import { resolveSessionKeyRing } from "./sessionKeys.js";

export type SessionTokenPayload = {
  r: "admin" | "user";
  u?: string;
  n?: string;
  sid?: string;
  did?: string;
  exp: number;
};

export type SessionTokenFailure = "invalid_format" | "invalid_signature" | "expired" | "missing_sid";

export type SessionTokenInspection =
  | { status: "ok"; payload: SessionTokenPayload }
  | { status: "invalid_format" | "invalid_signature" }
  | { status: "expired" | "missing_sid"; payload: SessionTokenPayload };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function readPayload(body: string): SessionTokenPayload | null {
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as SessionTokenPayload;
    if (!payload || (payload.r !== "admin" && payload.r !== "user")) return null;
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function signSessionToken(
  payload: Omit<SessionTokenPayload, "exp">,
  ttlMs: number
): string | null {
  const ring = resolveSessionKeyRing();
  if (!ring) return null;
  const full: SessionTokenPayload = { ...payload, exp: Date.now() + ttlMs };
  const body = b64url(JSON.stringify(full));
  const sig = b64url(crypto.createHmac("sha256", ring.current).update(body).digest());
  return `${body}.${sig}`;
}

/** Identidade só quando a assinatura confere e o prazo ainda vale, mesmo sem sid. */
export function sessionPayloadForGate(inspection: SessionTokenInspection): SessionTokenPayload | null {
  if (inspection.status === "ok" || inspection.status === "missing_sid") return inspection.payload;
  return null;
}

/** Identidade de um token fora do prazo. Assinatura inválida devolve nulo. */
export function expiredSessionPayload(inspection: SessionTokenInspection): SessionTokenPayload | null {
  return inspection.status === "expired" ? inspection.payload : null;
}

export function sessionFailureReason(inspection: SessionTokenInspection): SessionTokenFailure | null {
  return inspection.status === "ok" ? null : inspection.status;
}

export function inspectSessionToken(token: string | undefined | null): SessionTokenInspection {
  if (!token || typeof token !== "string") return { status: "invalid_format" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { status: "invalid_format" };
  const ring = resolveSessionKeyRing();
  if (!ring) return { status: "invalid_signature" };
  const [body, sig] = parts;
  const matches = ring.verify.some((key) => safeEqual(sig, b64url(crypto.createHmac("sha256", key).update(body).digest())));
  if (!matches) return { status: "invalid_signature" };
  const payload = readPayload(body);
  if (!payload) return { status: "invalid_format" };
  if (payload.exp < Date.now()) return { status: "expired", payload };
  const sid = typeof payload.sid === "string" ? payload.sid.trim() : "";
  if (!sid) return { status: "missing_sid", payload };
  return { status: "ok", payload: { ...payload, sid } };
}
