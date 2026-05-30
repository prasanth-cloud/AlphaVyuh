import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adrPath = "docs/decisions/015-market-data-entitlements.md";
const releasePath = "docs/release-readiness.md";

const adr = readFileSync(adrPath, "utf8");
const release = readFileSync(releasePath, "utf8");

function requireMatch(name, source, pattern) {
  assert.match(source, pattern, `${name} was missing from the market-data entitlement contract.`);
}

requireMatch("owner-gated ADR status", adr, /\*\*Status:\*\*\s*Proposed\s*\/\s*owner-gated/i);
requireMatch("EOD-first launch posture", adr, /launch as an EOD-first product/i);
requireMatch("no realtime launch claim", adr, /must not market itself as realtime or exchange-live/i);
requireMatch("TradingView charting-only boundary", adr, /TradingView Advanced Charts\s*\|\s*Charting UI library only/i);
requireMatch("TradingView datafeed boundary", adr, /not a bundled data vendor/i);
requireMatch("sector unverified posture", adr, /Sector data is \*\*unverified\*\* until audited/i);
requireMatch("5Y daily chart contract", adr, /five years of daily OHLCV coverage/i);
requireMatch("broker user-scoped data boundary", adr, /Broker account data is user-scoped/i);
requireMatch("broker data redistribution block", adr, /must not be repurposed as redistributed platform market data/i);
requireMatch("owner-gated vendor path", adr, /pricing, redistribution rights, SLAs, and contract terms/i);
requireMatch("TradingView owner approval gate", adr, /#42 records TradingView licensing approval or remains blocked/i);
requireMatch("linked sector gate", adr, /#285 sector taxonomy endpoint/i);
requireMatch("linked 5Y gate", adr, /#286 five-year daily candle smoke/i);
requireMatch("linked broker gate", adr, /#287 broker read-only smoke/i);

requireMatch("release docs EOD release posture", release, /Professional Access release[\s\S]*official\/free EOD bhavcopy/i);
requireMatch("release docs licensed data owner gate", release, /Licensed production data[\s\S]*TrueData\/GlobalDatafeeds/i);
requireMatch("release docs TradingView not launch source", release, /Legal\/data vendor decision is recorded/i);

console.log("Market-data entitlement contract check passed.");
