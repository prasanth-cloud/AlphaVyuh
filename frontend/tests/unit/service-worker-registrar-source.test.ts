import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/ServiceWorkerRegistrar.tsx", "utf8");

describe("service worker registration boundary", () => {
  it("does not request a service worker in development where next-pwa is disabled", () => {
    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source.indexOf('process.env.NODE_ENV !== "production"')).toBeLessThan(
      source.indexOf('navigator.serviceWorker.register("/sw.js")'),
    );
  });
});
