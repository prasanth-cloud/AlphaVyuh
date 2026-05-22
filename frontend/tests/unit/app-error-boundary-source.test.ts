import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/(app)/error.tsx", "utf8");

describe("authenticated app error boundary", () => {
  it("reports route errors without exposing raw exception text to traders", () => {
    expect(source).toContain("Sentry.captureException(error)");
    expect(source).not.toContain("console.error(\"[AppError]\"");
    expect(source).not.toContain("{error.message");
    expect(source).toContain("We logged this issue for review.");
  });

  it("keeps the retry action legible in the dark app shell", () => {
    expect(source).toContain("bg-[#2dd4bf]");
    expect(source).toContain("text-[#04111f]");
    expect(source).not.toContain("bg-[#f4f7fb] text-white");
  });
});
