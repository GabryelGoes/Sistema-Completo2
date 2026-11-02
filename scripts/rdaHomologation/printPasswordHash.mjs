#!/usr/bin/env node
/** Gera hash compatível com apiApp.hashPassword para seed de homologação. */
import crypto from "node:crypto";

const password = process.argv[2] || "homolog123";
const fixedSalt = process.argv[3] || "a".repeat(32);
const hash = crypto.pbkdf2Sync(password, fixedSalt, 100000, 64, "sha256").toString("hex");
console.log(`${fixedSalt}:${hash}`);
