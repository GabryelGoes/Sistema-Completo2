/**
 * Rode: npx tsx scripts/notificationSelfFilter.selftest.ts
 */
import {
  excludeSelfRecipientIds,
  extractNotificationAuthor,
  isSelfAuthoredBanner,
  isSelfAuthoredNotification,
  normalizeNotifyPersonLabel,
} from "../utils/notificationSelfFilter.js";

let failed = 0;

function ok(label: string, cond: boolean) {
  if (cond) {
    console.log(`  OK  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}`);
  }
}

console.log("notificationSelfFilter selftest\n");

ok(
  "normaliza acentos e espaços",
  normalizeNotifyPersonLabel("  João   Silva ") === "joao silva"
);

const identity = {
  userId: "user-x",
  role: "user" as const,
  displayNames: ["Usuário X", "userx"],
};

ok(
  "self por userId",
  isSelfAuthoredBanner("Outro Nome", "user-x", identity) === true
);

ok(
  "outro userId não é self",
  isSelfAuthoredBanner("Usuário X", "user-y", identity) === false
);

ok(
  "self por nome quando sem userId do autor",
  isSelfAuthoredBanner("Usuário X", null, identity) === true
);

ok(
  "nome diferente sem userId não é self",
  isSelfAuthoredBanner("Maria", null, identity) === false
);

ok(
  "payload com author_user_id",
  isSelfAuthoredNotification(
    { author_user_id: "user-x", author_display_name: "Usuário X" },
    identity
  ) === true
);

ok(
  "payload de outro autor",
  isSelfAuthoredNotification(
    { author_user_id: "user-y", author_display_name: "Usuário X" },
    identity
  ) === false
);

ok(
  "extract author fields",
  (() => {
    const a = extractNotificationAuthor({
      author_user_id: "abc",
      author_display_name: "Ana",
    });
    return a.userId === "abc" && a.displayName === "Ana";
  })()
);

ok(
  "excludeSelfRecipientIds remove o ator",
  JSON.stringify(excludeSelfRecipientIds(["a", "user-x", "b"], "user-x")) ===
    JSON.stringify(["a", "b"])
);

ok(
  "excludeSelfRecipientIds sem ator mantém lista",
  JSON.stringify(excludeSelfRecipientIds(["a", "b"], null)) ===
    JSON.stringify(["a", "b"])
);

const adminIdentity = {
  userId: null,
  role: "admin" as const,
  displayNames: ["Gerência", "Administrador"],
};

ok(
  "admin self por nome Gerência",
  isSelfAuthoredBanner("Gerência", null, adminIdentity) === true
);

ok(
  "admin não filtra técnico",
  isSelfAuthoredBanner("Técnico Y", "tech-1", adminIdentity) === false
);

if (failed > 0) {
  console.log(`\n${failed} falha(s)`);
  process.exit(1);
}
console.log("\nnotificationSelfFilter.selftest: ok");
