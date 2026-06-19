"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const REASON_MESSAGES: Record<string, string> = {
  missing_code: "No authorization code was provided.",
  exchange_failed: "Failed to verify the authorization code.",
};

export default function AuthErrorPage() {
  const params = useSearchParams();
  const reason = params.get("reason") ?? "";
  const message = REASON_MESSAGES[reason] ?? "An authentication error occurred.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-ds-bg">
      <div className="max-w-md space-y-4 rounded-ds-lg border border-ds-border bg-ds-surface p-6 text-center">
        <h1 className="text-xl font-semibold text-ds-t1">Authentication Error</h1>
        <p className="text-ds-t2">{message}</p>
        <Link
          href="/login"
          className="inline-block rounded-ds-md bg-ds-accent px-4 py-2 text-sm font-medium text-white"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
}
