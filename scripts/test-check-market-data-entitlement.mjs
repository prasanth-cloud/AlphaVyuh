import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adrPath = "docs/decisions/015-market-data-entitlements.md";
const releasePath = "docs/release-readiness.md";
const decisionRecordPath = "docs/market-data-provider-decision-record.md";

const adr = readFileSync(adrPath, "utf8");
const release = readFileSync(releasePath, "utf8");
const decisionRecord = readFileSync(decisionRecordPath, "utf8");

function requireMatch(name, source, pattern) {
  assert.match(source, pattern, `${name} was missing from the market-data entitlement contract.`);
}

requireMatch("owner-gated ADR status", adr, /\*\*Status:\*\*\s*Proposed\s*\/\s*owner-gated/i);
requireMatch("EOD-first launch posture", adr, /launch as an EOD-first product/i);
requireMatch("no realtime launch claim", adr, /must not market itself as realtime or exchange-live/i);
requireMatch("dated public research section", adr, /Public Research Findings - 2026-05-30/i);
requireMatch("ChartsMaze workflow-only posture", adr, /ChartsMaze as workflow\/product inspiration, not as entitlement evidence/i);
requireMatch("TradingView charting-only boundary", adr, /TradingView Advanced Charts\s*\|\s*Charting UI library only/i);
requireMatch("TradingView datafeed boundary", adr, /not a bundled data vendor/i);
requireMatch("TradingView widgets versus libraries boundary", adr, /hosted widgets[\s\S]*include TradingView-hosted data[\s\S]*libraries[\s\S]*connect to AlphaVyuh's own datafeed/i);
requireMatch("TradingView broker and data separation", adr, /broker manual separates data integration from trading integration/i);
requireMatch("sector unverified posture", adr, /Sector data is \*\*unverified\*\* until audited/i);
requireMatch("5Y daily chart contract", adr, /five years of daily OHLCV coverage/i);
requireMatch("Kite Connect data pricing boundary", adr, /Connect plan includes realtime WebSocket data and historical candles at INR 500 per app per month/i);
requireMatch("broker user-scoped data boundary", adr, /Broker account data is user-scoped/i);
requireMatch("broker data redistribution block", adr, /must not be repurposed as redistributed platform market data/i);
requireMatch("broker candle redistribution non-goal", adr, /broker historical candles, quotes, or orderbook data can be reused as AlphaVyuh's platform-wide chart feed/i);
requireMatch("DhanHQ price reference", adr, /Dhan's public support page lists the Data API subscription at INR 499 plus taxes per month/i);
requireMatch("owner-gated vendor path", adr, /pricing, redistribution rights, SLAs, and contract terms/i);
requireMatch("TrueData and GlobalDatafeeds owner-gated quote path", adr, /TrueData and GlobalDatafeeds[\s\S]*owner-gated vendor quote paths/i);
requireMatch("TradingView owner approval gate", adr, /#42 records TradingView licensing approval or remains blocked/i);
requireMatch("linked sector gate", adr, /#285 sector taxonomy endpoint/i);
requireMatch("linked 5Y gate", adr, /#286 five-year daily candle smoke/i);
requireMatch("linked broker gate", adr, /#287 broker read-only smoke/i);
requireMatch("provider decision record linked", adr, /docs\/market-data-provider-decision-record\.md/i);

requireMatch("release docs EOD release posture", release, /Professional Access release[\s\S]*official\/free EOD bhavcopy/i);
requireMatch("release docs licensed data owner gate", release, /Licensed production data[\s\S]*TrueData\/GlobalDatafeeds/i);
requireMatch("release docs TradingView not launch source", release, /Legal\/data vendor decision is recorded/i);
requireMatch("release docs public research guard", release, /public competitor\/provider research stays explicit/i);
requireMatch("release docs broker data reuse guard", release, /broker data cannot be reused as redistributed\s+platform candles/i);
requireMatch("release docs provider decision record", release, /market-data-provider-decision-record\.md/i);

requireMatch("decision record owner-gated status", decisionRecord, /\*\*Status:\*\*\s*Owner-gated/i);
requireMatch("decision record blocks realtime source", decisionRecord, /Realtime or delayed platform feed[\s\S]*Blocked until owner signs vendor\/exchange terms/i);
requireMatch("decision record requires redistribution rights", decisionRecord, /Redistribution rights[\s\S]*authenticated SaaS users/i);
requireMatch("decision record requires five-year depth", decisionRecord, /Historical depth[\s\S]*Five years daily OHLCV/i);
requireMatch("decision record separates broker data", decisionRecord, /Broker account data[\s\S]*user-scoped and read-only/i);
requireMatch("decision record blocks ChartsMaze inference", decisionRecord, /Infer their hidden data vendor, broker routing, or licensing model/i);
requireMatch("decision record provider PR packet", decisionRecord, /Every PR that changes `MARKET_DATA_PROVIDER`/i);

console.log("Market-data entitlement contract check passed.");
