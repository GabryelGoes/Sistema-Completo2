const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "..", "server.ts");
const lines = fs.readFileSync(p, "utf8").split("\n");
// Remove lines 14-1569 (index 13 to 1568 inclusive), add PORT and VITE comment
const before = lines.slice(0, 13);
const after = lines.slice(1569);
const inserted = ["  const PORT = 3000;", "", "  // ----------------- VITE / FRONTEND -----------------"];
const newLines = before.concat(inserted, after);
fs.writeFileSync(p, newLines.join("\n"));
console.log("server.ts stripped, lines:", newLines.length);
