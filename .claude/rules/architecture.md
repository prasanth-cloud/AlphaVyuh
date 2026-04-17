# Architecture Rules

## Source of truth
- `backend/app/main.py` — registers all routers, CORS config, APScheduler jobs
- `frontend/lib/api.ts` — all frontend API calls live here (984+ lines); never fetch directly from pages
- `supabase/migrations/` — numbered 001–015, sequential, never edited after creation

## Router pattern
Every backend router follows this pattern:
```python
from app.middleware.auth import get_current_user_id   # correct import
from app.services.supabase import get_admin_client     # correct import
router = APIRouter(prefix="/api/v1/<resource>", tags=["<resource>"])
```
New routers must be registered in `app/main.py`. **Do not use** `app.dependencies` or `app.database` — these modules do not exist. `community.py` has this bug currently.

## Plan check pattern
All entitlement checks use:
```python
def _get_user_plan(user_id: str) -> str:
    sb = get_admin_client()
    r = sb.table("users").select("plan").eq("id", user_id).single().execute()
    return r.data["plan"] if r.data else "free"
```
Use `plan_cache` from `services/rate_limit.py` to avoid per-request DB hits on hot paths.

## PostgREST FK disambiguation
Queries joining `stock_universe` from `daily_ohlcv` must use explicit FK hint:
```python
# Correct
"stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,is_active,market,currency)"
# Wrong — triggers PGRST201 ambiguous FK error
"stock_universe!inner(symbol,company_name)"
```
This applies to scanner, backtest, and any new query joining these tables.

## Token flow (frontend)
- `frontend/lib/api.ts` has module-level `_token` cache
- `onAuthStateChange(INITIAL_SESSION)` fires on load and populates the cache
- `authHeaders()` is async — always `await authHeaders()` before fetch
- Never access `supabase.auth.getSession()` directly in pages; use `authHeaders()`

## APScheduler jobs
Two jobs registered in `main.py`:
1. `16:00 IST` daily → bhavcopy ingest (`services/bhavcopy.py`)
2. After ingest completes → scan alerts (`routers/alerts.py`)

Do not add time-sensitive logic that depends on the scheduler being in sync with Railway's clock.

## Rate limiting
In-memory singletons in `services/rate_limit.py`:
- `scanner_limiter`: 30 scans/minute per user
- `ai_limiter`: 5 AI calls per 5 minutes per user
- `plan_cache`: 60s TTL for plan lookups

These reset on process restart (Railway restart = limits reset). Fine for current scale.

## Community router — BACKEND CRASH (do not ignore)
`backend/app/routers/community.py` is imported **unconditionally** in `main.py` line 10:
```python
from app.routers import ... community as community_router ...
```
Unlike `payments` and `ai` (which use `try/except`), this import is not guarded. `community.py` imports from `app.dependencies` and `app.database` which do not exist — so the **entire backend crashes on startup**.

Fix (requires approval): change `community.py` lines 4–5 to:
```python
from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client
```
Or wrap the import in `main.py` with try/except as a temporary guard.

## Never do
- Add a new router without registering it in `main.py`
- Compute indicators inline in a request handler — they're precomputed in `daily_ohlcv`
- Use `supabase.py`'s client with user JWT — always use service-role `get_admin_client()`
- Write raw SQL in routers — use the Supabase Python client
- Import from `app.dependencies` or `app.database` — they don't exist
