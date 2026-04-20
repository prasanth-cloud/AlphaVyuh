# Architecture

> Load this file when a task involves system-level decisions, cross-cutting changes, or debugging flow across layers. Skip for isolated component work.

## One-line summary

Next.js on Vercel talks to Supabase for data/auth and to user-connected brokers for order routing; a background worker polls quote feeds and runs scanners on cached EOD data.

## Request flow

TODO — fill in once the order placement path is implemented.

## Deploy topology

- **App:** Vercel (production on `main`, preview per PR)
- **Database:** Supabase managed Postgres
- **Background jobs:** TBD — leaning Supabase Edge Functions + pg_cron for scheduled scans; may move to a separate worker if latency demands
- **Static assets:** Vercel CDN

## Environments

| Env | Branch | DB | URL |
|---|---|---|---|
| Production | `main` | Supabase prod project | alphavyuh.com |
| Preview | PR | Supabase staging project | auto-generated |
| Local | — | local Supabase (`bun run db:start`) | localhost:3000 |

## Observability

- **Logs:** Vercel for app, Supabase for DB & Edge Functions
- **Errors:** Sentry — TODO, not yet wired
- **Product analytics:** TODO

## Open architecture questions

- Do broker webhooks come to Vercel (serverless, stateless) or to a persistent worker? Affects reliability of auto-journal on fills that happen while user is offline.
- Scan engine: in-process Postgres functions vs. a Python worker vs. node-side compute? Leaning Postgres for SEPA/VCP since inputs are already indexed there.
