# ADR 014 — Chart Snapshot at Trade Entry

## Status

Accepted — 2026-04-23. Scoped for M4 implementation.

---

## Context

### The gap this closes

The current journal captures trades as prose: symbol, direction, price, quantity, and whatever the user writes in "why are you entering?" That text is better than nothing, but it is not the same as the chart. A trader who writes "EMA alignment and volume surge on the weekly" cannot, six weeks later, reconstruct what the chart looked like — whether the stock was 4% above the 21 EMA or 0.4%, whether volume was 2× average or 5×, whether the base was tight or ragged. The prose is a summary of what they *thought they saw*, filtered through memory and post-hoc rationalization.

The AI feedback loop in M7 depends on something more reliable. If the system is going to tell a trader "your VCP entries with base depth > 20% underperform your tighter entries," it needs the actual chart state at entry, not a prose description.

This ADR defines how we capture that state.

### Relationship to other ADRs

- **ADR 013 (Product wedge):** Journal is the wedge. M4 ships chart snapshot *as a journal feature*, not as a chart feature. The framing matters: we are building "here's what you saw when you clicked buy," not "here's a screenshot tool."
- **ADR 011 (Realtime architecture):** M4 order placement flow. The snapshot is captured in the order submit path, before broker confirmation, using the TradingView widget's own API.
- **ADR 012 (Design system):** Snapshot display in the journal entry view must use design tokens. No special art direction for the snapshot card.

---

## Decisions

### 1 — What to capture

Three options were evaluated:

| Option | Storage | AI-readable | Visual | Verdict |
|---|---|---|---|---|
| **(a) Image only** — PNG/WebP via TV's `takeScreenshot()` | ~350KB/trade | No (would require vision model) | Yes | Rejected standalone |
| **(b) Structured state only** — JSON via TV's `widget.save()` (indicators, drawings, timeframe, viewport, timestamp) | ~5KB/trade | Yes | No (requires chart reconstruction) | Rejected standalone |
| **(c) Both** — image + structured state | ~355KB/trade | Yes | Yes | **Accepted** |

**Decision: capture both image and structured state (option c).**

Rationale: the image is what the user wants to see when they review a trade. The structured state is what the AI needs in M7 for pattern matching. Building one without the other forces a rebuild later. The marginal storage cost of adding the JSON alongside the image is negligible (5KB vs 350KB). Build both in M4.

The image format is WebP (not PNG) for compression efficiency. Target size: ≤300KB per snapshot at 1280×720 crop of the visible chart region. Structured state is plain JSON, gzip-compressed at the Storage layer.

### 2 — When to capture

Capture happens **on order submit**, not on fill confirmation.

The decision context — what the trader saw, what made them click buy — is fixed at submit time. Fill confirmation happens between 30ms and several seconds later for market orders; the chart has moved. For limit orders, fill may happen minutes or hours later; the chart has moved significantly.

There is a secondary insight available from capturing at submit: rejected and cancelled orders are still recorded with a snapshot. This feeds the M7 analysis of "your rejected orders had better setups than your fills" — a useful pattern that disappears if we only capture on fill.

Fill confirmation updates the journal entry with execution details (actual fill price, qty, order ID) but does not create or update the snapshot. The snapshot remains a record of the moment of decision, not the moment of execution.

### 3 — Storage

**Supabase Storage, private bucket `trade-snapshots`.**

Files are namespaced by user then trade:
```
trade-snapshots/{user_id}/{trade_id}.webp   ← image
trade-snapshots/{user_id}/{trade_id}.json   ← structured state
```

Serving to the journal UI uses **signed URLs with a 1-hour expiry**. The frontend requests a signed URL from the backend; the backend generates it with `supabase.storage.from('trade-snapshots').createSignedUrl(path, 3600)` using the service-role client. The URL is not stored in the database — it is generated on demand when the journal entry is loaded.

**Rejected alternative — inline base64 in the DB row:** bloats row size, breaks PostgREST pagination (rows with large text fields can exceed the default 1MB row-fetching limit), and makes backups expensive. Not considered further.

**RLS on the storage bucket:**
```sql
-- Users may only read/write objects whose path starts with their own user_id
create policy "Users can manage own snapshots"
  on storage.objects for all
  using (
    bucket_id = 'trade-snapshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

### 4 — Database schema

Two nullable columns added to `journal_trades` (migration 034, to be written when M4 begins):

```sql
alter table public.journal_trades
  add column if not exists snapshot_image_path  text,
  add column if not exists snapshot_state_path  text;
```

Both are nullable because:
- Pre-M4 journal entries (manual entry before the chart ships) have no snapshots.
- Post-M4 manual journal entries (user logs a trade not from the chart) also have no snapshots.
- Nullable is more honest than a sentinel empty string.

No separate `snapshots` table. The 1:1 relationship with trades makes a junction table overkill, and it would add a join to every journal load. Paths stored directly on the row.

### 5 — Deletion cascade

Supabase Storage does not provide a database-level cascade-on-delete. When a journal entry is deleted, the API route (`DELETE /api/v1/journal/:id`) must explicitly delete the corresponding storage objects before (or after) deleting the DB row:

```python
# In the delete handler, before row deletion
if entry.snapshot_image_path:
    supabase.storage.from_("trade-snapshots").remove([entry.snapshot_image_path])
if entry.snapshot_state_path:
    supabase.storage.from_("trade-snapshots").remove([entry.snapshot_state_path])
```

If the Storage delete fails (file already gone, transient error), log the failure but do not block the row deletion. Orphaned files in Storage are a billing nuisance, not a correctness issue.

### 6 — M4 capture flow

```
User clicks Buy/Sell on chart
        │
        ▼
Order ticket opens (symbol, qty, limit/market, SL, target)
        │
User clicks Submit
        │
        ├──► Call widget.save(callback) → structured state JSON
        │         POST /api/v1/journal/snapshots (state: JSON)
        │         Backend uploads to {user_id}/{trade_id}.json
        │
        ├──► Call widget.takeScreenshot() → image data URL or blob
        │         Upload to Supabase Storage via presigned URL
        │         Path: {user_id}/{trade_id}.webp
        │
        └──► POST /api/v1/orders (broker order placement)
                  On broker response: create/update journal entry
                  Link snapshot_image_path + snapshot_state_path
                  to the trade row
```

The three operations (save state, upload image, place order) are run in parallel where possible. A failure in snapshot capture must not block order placement — the order is the primary action. If capture fails, the journal entry is created with null snapshot paths and the error is logged (Sentry in M4). The user can still review the trade; they just won't have a snapshot.

### 7 — TradingView API availability

The implementation depends on the TradingView Charting Library providing two APIs:

| API | TV tier | Notes |
|---|---|---|
| `widget.save(callback)` | Charting Library (all tiers) | Returns full chart state JSON. Documented, stable. |
| `widget.takeScreenshot()` | **Verify before M4 begins.** May require Trading Platform tier. | Returns signed S3 URL or data URL depending on integration mode. |

**If `takeScreenshot()` is unavailable at our license tier**, the fallback is:
1. Ship M4 with structured state only (`widget.save()` only).
2. Image snapshot is deferred — journal entry shows "chart snapshot not available" in the entry view.
3. When we upgrade to a tier that includes `takeScreenshot()`, or implement a canvas-based alternative (possible only if TV renders into an accessible iframe, which the self-hosted Charting Library does), backfill is not needed — new trades will start getting images automatically.

This degradation is acceptable. The structured state alone is sufficient for M7 AI analysis. The image is the user-facing polish layer.

**Note for M4 implementation:** verify the TV library's iframe isolation model before assuming canvas capture will work. If the chart renders into a same-origin iframe, `canvas.toBlob()` on the iframe's canvas element is a viable alternative to `takeScreenshot()`. If cross-origin, only TV's own API works.

### 8 — Cost and scale

| Metric | Assumption | Value |
|---|---|---|
| Active paying users | M4 launch | 100 |
| Trades per user per day | Average swing trader | 2 (not 10 — swing, not day trading) |
| Snapshot size | WebP image + JSON | ~355KB |
| Daily storage add | 100 × 2 × 355KB | ~71MB/day |
| Monthly add | | ~2.1GB/month |
| Annual total | | ~25GB |

Supabase Pro includes 100GB Storage. At this scale, storage cost is $0 for the first 3–4 years of growth. Egress for signed URL fetches: negligible — users view their own trades occasionally, not continuously.

At 1,000 paying users: ~250GB/year, costing ~$3.15/month in overage. Acceptable.

### 9 — Privacy

- Snapshots contain no PII but reveal a user's chart configuration, indicator setup, and trading positions.
- Private bucket + RLS + signed URLs (1-hour expiry) means no content is publicly accessible.
- If social sharing is ever added (a user sharing their "best trade" setup), it must be opt-in per snapshot, with a separate presigned URL generated for the shared context. The sharing UI is out of scope for M4–M7.
- GDPR/account deletion: when a user deletes their account, all Storage objects under their `user_id/` prefix must be deleted. The account deletion flow (to be built) must include a `storage.from('trade-snapshots').list(userId)` → bulk remove step before the auth user record is deleted.

---

## What is NOT decided here

- The chart UI itself (under active design as part of M4; see ADR 011 for realtime architecture).
- The M7 AI analysis that *uses* the structured state. The structured state schema captured here must be stable enough to be queried against in M7, but what queries look like is M7's problem.
- User-initiated "snapshot now" outside of order flow. This is a nice-to-have (user is studying a chart and wants to bookmark what they see, not place a trade). Deferred to post-M7. Don't add it to M4.

---

## Migration stub (when M4 begins)

Migration number TBD (likely 034). Write this when M4 starts, not now:

```sql
-- ⚠️ Write actual migration when M4 begins. Column names are final.
alter table public.journal_trades
  add column if not exists snapshot_image_path  text,
  add column if not exists snapshot_state_path  text;

comment on column public.journal_trades.snapshot_image_path
  is 'Supabase Storage path to WebP chart snapshot at order submit time. Null for pre-M4 entries.';

comment on column public.journal_trades.snapshot_state_path
  is 'Supabase Storage path to JSON chart state (TV widget.save output) at order submit time. Null for pre-M4 entries.';
```

Storage bucket provisioning (via Supabase dashboard or migration):
```sql
insert into storage.buckets (id, name, public)
values ('trade-snapshots', 'trade-snapshots', false);
```

---

## Revisit conditions

This ADR is binding for M4. Revisit if:

1. TradingView's `takeScreenshot()` API is confirmed unavailable at our tier, and canvas capture is also infeasible (cross-origin iframe) — revisit §7 fallback plan.
2. At 500+ users, Storage egress costs spike unexpectedly — revisit image format or lazy-load strategy.
3. M7 AI analysis requires a different structured state schema than TV's `widget.save()` output — revisit §1 and define a transformation layer.
4. User research in M5–M6 shows users don't look at the snapshot in the journal — revisit whether image capture is worth the complexity, and drop to structured state only.
