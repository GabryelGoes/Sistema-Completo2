/**
 * Selftest: contador de falhas da senha de elevação (Gerência).
 * Executar: npx tsx scripts/elevationPasswordAttempts.selftest.ts
 */
import assert from "node:assert/strict";
import {
  ELEVATION_PASSWORD_MAX_ATTEMPTS,
  buildElevationPasswordFailure,
  elevationPasswordBucketKey,
} from "../utils/elevationPasswordAttempts.js";
import { shouldClearSession } from "../utils/shouldClearSession.js";

console.log("1) bucket key preferência sessão > device > ip");
{
  assert.equal(
    elevationPasswordBucketKey({ sessionId: "sid-1", deviceId: "dev-1", ip: "1.1.1.1" }),
    "elevation:session:sid-1"
  );
  assert.equal(
    elevationPasswordBucketKey({ sessionId: null, deviceId: "dev-1", ip: "1.1.1.1" }),
    "elevation:device:dev-1"
  );
  assert.equal(
    elevationPasswordBucketKey({ sessionId: "  ", deviceId: null, ip: "1.1.1.1" }),
    "elevation:ip:1.1.1.1"
  );
}

console.log("2) tentativas 1–2 preservam sessão; 3 encerra");
{
  const a1 = buildElevationPasswordFailure({ attempts: 1, baseError: "Senha incorreta." });
  assert.equal(a1.lockSession, false);
  assert.equal(a1.body.code, "invalid_credentials");
  assert.equal(a1.body.attemptsRemaining, 2);
  assert.equal(shouldClearSession(401, a1.body), false);

  const a2 = buildElevationPasswordFailure({ attempts: 2, baseError: "Senha incorreta." });
  assert.equal(a2.lockSession, false);
  assert.equal(a2.body.code, "invalid_credentials");
  assert.equal(a2.body.attemptsRemaining, 1);
  assert.equal(shouldClearSession(401, a2.body), false);

  const a3 = buildElevationPasswordFailure({ attempts: 3, baseError: "Senha incorreta." });
  assert.equal(a3.lockSession, true);
  assert.equal(a3.body.code, "session_invalid");
  assert.equal(shouldClearSession(401, a3.body), true);

  assert.equal(ELEVATION_PASSWORD_MAX_ATTEMPTS, 3);
}

console.log("3) mensagem inclui contagem nas tentativas 1–2");
{
  const a1 = buildElevationPasswordFailure({
    attempts: 1,
    baseError: "Senha incorreta. Use a senha da Gerência",
  });
  assert.match(a1.body.error, /Tentativa 1 de 3/);
  const a3 = buildElevationPasswordFailure({ attempts: 3, baseError: "x" });
  assert.match(a3.body.error, /3 tentativas/i);
}

console.log("\nOK elevationPasswordAttempts.selftest");
