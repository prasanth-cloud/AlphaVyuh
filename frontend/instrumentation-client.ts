import * as Sentry from "@sentry/nextjs";

import { initClientSentry } from "./lib/sentry";

initClientSentry();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
