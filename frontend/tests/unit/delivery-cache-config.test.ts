import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nextConfig = readFileSync("next.config.mjs", "utf8");
const tapeRoute = readFileSync("app/api/public/market-tape/route.ts", "utf8");
const dashboardTape = readFileSync("components/dashboard/LiveIndexTape.tsx", "utf8");

describe("public delivery cache contract", () => {
  it("keeps marketing HTML browser-revalidated and edge-cacheable", () => {
    expect(nextConfig).toContain('"Cache-Control", value: "public, max-age=0, must-revalidate"');
    expect(nextConfig).toContain('"CDN-Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=3600"');
    expect(nextConfig).toContain('"Vercel-CDN-Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400"');
    expect(nextConfig).not.toContain('"Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate"');
  });

  it("caches the live market tape for its five-minute freshness window", () => {
    expect(tapeRoute).toContain('"Cache-Control": "public, max-age=60, stale-while-revalidate=240"');
    expect(tapeRoute).toContain('"CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"');
    expect(tapeRoute).toContain('"Vercel-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"');
    expect(dashboardTape).toContain('fetch("/api/public/market-tape")');
    expect(dashboardTape).not.toContain('fetch("/api/public/market-tape", { cache: "no-store" })');
  });
});
