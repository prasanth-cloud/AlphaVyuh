import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const onboardingSource = readFileSync("app/(app)/onboarding/page.tsx", "utf8");

describe("onboarding launch scope copy", () => {
  it("keeps first-run setup focused on cash equities", () => {
    expect(onboardingSource).toContain("NSE/BSE cash equities");
    expect(onboardingSource).toContain("outside this launch scope");
    expect(onboardingSource).toContain("const DEFAULT_TRADE_SCOPE = TRADE_SCOPE_OPTIONS[0]?.value ?? \"\"");
    expect(onboardingSource).toContain("disabled={!ready || !form.experience || !form.trades}");
    expect(onboardingSource).not.toContain('value="fno"');
    expect(onboardingSource).not.toContain("futures & options");
    expect(onboardingSource).not.toContain('label="Both"');
  });
});
