import { describe, expect, it } from "vitest";
import { setupBlockingAccountIssues, uniqueAccountIssues, type AccountDataIssue } from "@/lib/account-data-status";

const issue = (id: AccountDataIssue["id"], label: string = id): AccountDataIssue => ({
  id,
  label,
  href: `/${id}`,
  message: `${label} unavailable`,
});

describe("account data status", () => {
  it("deduplicates issues while preserving first-seen order", () => {
    expect(uniqueAccountIssues([
      issue("journal", "Journal entries"),
      null,
      issue("alerts", "Scan alerts"),
      issue("journal", "Journal stats"),
    ])).toEqual([
      issue("journal", "Journal entries"),
      issue("alerts", "Scan alerts"),
    ]);
  });

  it("does not let optional alert outages block setup completion", () => {
    expect(setupBlockingAccountIssues([
      issue("watchlists"),
      issue("alerts"),
      issue("broker"),
    ])).toEqual([
      issue("watchlists"),
      issue("broker"),
    ]);
  });
});
