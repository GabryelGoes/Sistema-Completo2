const fs = require("fs");
const path = require("path");
const c = fs.readFileSync(path.join(__dirname, "..", "server.ts"), "utf8");
const start = c.indexOf("  app.use(express.json());");
const end = c.indexOf("  // ----------------- VITE / FRONTEND");
const body = c.substring(start, end).trimEnd();
const header = [
  'import "dotenv/config";',
  "import express from \"express\";",
  "import multer from \"multer\";",
  "import { supabaseAdmin, VEHICLE_PHOTOS_BUCKET } from \"./supabaseClient.js\";",
  "import { FIRST_STAGE, ALL_STATUSES } from \"./constants/serviceOrderStages.js\";",
  "",
  "export function createApiApp() {",
  "  const app = express();",
  "  const WORKSHOP_ID = process.env.WORKSHOP_ID;",
].join("\n");
const footer = "\n  return app;\n}\n";
fs.writeFileSync(path.join(__dirname, "..", "apiApp.ts"), header + body + footer);
console.log("apiApp.ts created");
