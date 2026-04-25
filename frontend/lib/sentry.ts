import * as Sentry from "@sentry/nextjs";

const SCRUBBED_FIELDS = new Set([
  "password",
  "token",
  "api_key",
  "access_token",
  "refresh_token",
]);

function scrubObject(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (SCRUBBED_FIELDS.has(key)) {
      obj[key] = "[Filtered]";
    } else if (obj[key] !== null && typeof obj[key] === "object") {
      scrubObject(obj[key] as Record<string, unknown>);
    }
  }
}

function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request?.data && typeof event.request.data === "object") {
    scrubObject(event.request.data as Record<string, unknown>);
  }
  if (event.extra && typeof event.extra === "object") {
    scrubObject(event.extra as Record<string, unknown>);
  }
  return event;
}

export function initClientSentry() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: false,
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
}

export function initServerSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: false,
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
}

export function initEdgeSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: false,
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
}
