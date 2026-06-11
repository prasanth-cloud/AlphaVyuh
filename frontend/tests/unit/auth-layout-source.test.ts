import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authLayoutSource = readFileSync("app/(auth)/layout.tsx", "utf8");
const globalsCss = readFileSync("app/globals.css", "utf8");
const brandLogoSource = readFileSync("components/BrandLogoMark.tsx", "utf8");

describe("auth layout polish", () => {
  it("uses the shared gradient chart-line logo instead of a plain A mark", () => {
    expect(authLayoutSource).toContain("BrandLogoMark");
    expect(authLayoutSource).toContain('className="auth-brand-mark"');
    expect(authLayoutSource).not.toMatch(/auth-brand-mark[^>]*>\s*A\s*</);
    expect(brandLogoSource).toContain('d="M2 14L6.5 8L10 11L14.5 4L16 6"');
  });

  it("aligns auth aside typography with Geist scale and semibold headings", () => {
    expect(authLayoutSource).toContain("auth-aside-title");
    expect(authLayoutSource).toContain("auth-aside-lead");
    expect(globalsCss).toContain(".auth-aside-title");
    expect(globalsCss).toContain("font-weight: var(--weight-semibold)");
    expect(globalsCss).toContain("linear-gradient(135deg, var(--accent), var(--info))");
  });
});
