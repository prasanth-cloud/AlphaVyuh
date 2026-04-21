# Observability

## Error tracking — Sentry

The frontend uses `@sentry/nextjs`. Three config files loaded automatically by the SDK:

| File | Loaded in |
|---|---|
| `sentry.client.config.ts` | Browser (client components) |
| `sentry.server.config.ts` | Node.js (Server Components, Route Handlers) |
| `sentry.edge.config.ts` | Edge runtime (Middleware) |

`next.config.mjs` wraps the Next.js config with `withSentryConfig` — this injects the SDK initialization and handles sourcemap upload during `next build`.

### Env vars required

```
NEXT_PUBLIC_SENTRY_DSN   # public, sent to browser
SENTRY_DSN               # server-only
SENTRY_ORG               # for sourcemap upload
SENTRY_PROJECT           # for sourcemap upload
SENTRY_AUTH_TOKEN        # for sourcemap upload (set in Vercel env, not committed)
```

See `.env.example` for the full list. Set these in the Vercel dashboard under each environment (production, staging).

### Field scrubbing

`beforeSend` in `sentry.client.config.ts` and `sentry.server.config.ts` recursively scrubs these field names from event payloads before they reach Sentry:

- `password`
- `token`
- `api_key`
- `access_token`
- `refresh_token`

Scrubbed values are replaced with `"[Filtered]"`. If you add a new sensitive field, add it to the `SCRUBBED_FIELDS` set in both client and server config files.

### Sampling rates

- Development (`NODE_ENV=development`): 100% of traces captured (useful for local debugging)
- Production (`NODE_ENV=production`): 10% of traces (`tracesSampleRate: 0.1`) — adjust up if investigating a specific issue

### Verifying Sentry is working

To confirm events reach your Sentry project:

1. Add a temporary throw to any Server Component or Route Handler:
   ```typescript
   throw new Error("sentry-test: this should appear in the Sentry dashboard");
   ```
2. Trigger the route locally or on staging
3. Check your Sentry project → Issues
4. Remove the throw before merging

Do not use a deliberate throw in production to test — use staging.

### Source maps

`withSentryConfig` uploads source maps during `next build` when `SENTRY_AUTH_TOKEN` is set. Source maps are hidden from the browser (`hideSourceMaps: true`). Without the auth token, the build still succeeds but stack traces in Sentry will show minified code.

## Backend monitoring

The Python backend (Railway) does not have Sentry configured yet. When added, use `sentry-sdk[fastapi]` and set `SENTRY_DSN` in Railway env vars. Track this as a known gap until M2.

## Production logging

- Vercel: runtime logs visible in the Vercel dashboard and via `vercel logs` CLI
- Railway: stdout logs visible in Railway dashboard
- No structured logging library yet — add when log volume makes searching painful
