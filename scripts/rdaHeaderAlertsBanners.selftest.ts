/**
 * Selftest: preferências de banners RDA + acesso cliente ao cabeçalho.
 * npm run test:rda-header-alerts-banners
 */
import assert from "node:assert/strict";
import {
  DEFAULT_RDA_BANNER_SETTINGS,
  rdaBannerAllowedForSeverity,
  type RdaBannerSettings,
} from "../utils/rdaBannerSettings.js";
import { clientCanViewProactiveIntelligence } from "../utils/rdaProactiveClientAccess.js";

console.log("RDA header alerts / banners selftest\n");

assert.equal(DEFAULT_RDA_BANNER_SETTINGS.enabled, true);
assert.equal(DEFAULT_RDA_BANNER_SETTINGS.critical, true);
assert.equal(DEFAULT_RDA_BANNER_SETTINGS.warning, true);
assert.equal(DEFAULT_RDA_BANNER_SETTINGS.info, false);

assert.equal(rdaBannerAllowedForSeverity(DEFAULT_RDA_BANNER_SETTINGS, "critical"), true);
assert.equal(rdaBannerAllowedForSeverity(DEFAULT_RDA_BANNER_SETTINGS, "warning"), true);
assert.equal(rdaBannerAllowedForSeverity(DEFAULT_RDA_BANNER_SETTINGS, "info"), false);

const masterOff: RdaBannerSettings = {
  ...DEFAULT_RDA_BANNER_SETTINGS,
  enabled: false,
};
assert.equal(rdaBannerAllowedForSeverity(masterOff, "critical"), false);

const criticalOnly: RdaBannerSettings = {
  enabled: true,
  critical: true,
  warning: false,
  info: false,
};
assert.equal(rdaBannerAllowedForSeverity(criticalOnly, "critical"), true);
assert.equal(rdaBannerAllowedForSeverity(criticalOnly, "warning"), false);

assert.equal(
  clientCanViewProactiveIntelligence({ role: "admin", isTechnician: false }),
  true
);
// Flag isTechnician sozinha não bloqueia (igual ao servidor) se houver permissão de área.
assert.equal(
  clientCanViewProactiveIntelligence({
    role: "user",
    isTechnician: true,
    permissions: { access_patio: true },
  }),
  true
);
assert.equal(
  clientCanViewProactiveIntelligence({
    role: "user",
    isTechnician: true,
    permissions: { full_access: true },
  }),
  true
);
assert.equal(
  clientCanViewProactiveIntelligence({
    role: "user",
    isTechnician: false,
    permissions: { access_patio: true },
  }),
  true
);
assert.equal(
  clientCanViewProactiveIntelligence({
    role: "user",
    isTechnician: true,
    permissions: { access_home: true },
  }),
  false
);

console.log("OK — defaults, severity gates e ACL do cabeçalho.\n");
