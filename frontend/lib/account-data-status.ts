export type AccountDataIssueId = "watchlists" | "journal" | "broker" | "alerts";

export type AccountDataIssue = {
  id: AccountDataIssueId;
  label: string;
  message: string;
  href: string;
};

export type AccountDataResult<T> = {
  data: T | null;
  issue: AccountDataIssue | null;
};

export function accountDataErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export async function captureAccountData<T>(
  promise: Promise<T>,
  issue: Omit<AccountDataIssue, "message">,
  fallbackMessage: string,
): Promise<AccountDataResult<T>> {
  try {
    return { data: await promise, issue: null };
  } catch (error) {
    return {
      data: null,
      issue: {
        ...issue,
        message: accountDataErrorMessage(error, fallbackMessage),
      },
    };
  }
}

export function uniqueAccountIssues(issues: Array<AccountDataIssue | null | undefined>): AccountDataIssue[] {
  const seen = new Set<AccountDataIssueId>();
  const unique: AccountDataIssue[] = [];
  for (const issue of issues) {
    if (!issue || seen.has(issue.id)) continue;
    seen.add(issue.id);
    unique.push(issue);
  }
  return unique;
}

export function setupBlockingAccountIssues(issues: AccountDataIssue[]): AccountDataIssue[] {
  return issues.filter((issue) => issue.id !== "alerts");
}
