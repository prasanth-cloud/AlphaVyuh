import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServerSentry } = await import("./lib/sentry");
    initServerSentry();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const { initEdgeSentry } = await import("./lib/sentry");
    initEdgeSentry();
  }
}

export const onRequestError = Sentry.captureRequestError;
