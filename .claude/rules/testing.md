# Testing Rules

## Current state
Tests exist in `backend/tests/` (added in latest pull):
- `test_payments.py` — plan price table (all INR/USD/monthly/annual combos) + Razorpay HMAC signature verification (pure logic, no DB)
- `test_scanner_filters.py` — numeric/bool/market filter logic including US market routing (pure logic, no DB)
- `test_rate_limit.py` — RateLimiter and PlanCache behavior (in-memory, no DB)

No frontend tests exist (no Jest, no Playwright, no test directory).

**Note**: `cd backend && .venv/bin/python -c "from app.main import app"` currently fails due to broken imports in `community.py`. Pytest still runs because test files don't import `app.main`.

## Running tests
```bash
cd backend
.venv/bin/python -m pytest tests/ -v
.venv/bin/python -m pytest tests/test_payments.py -v
.venv/bin/python -m pytest tests/test_rate_limit.py -v
.venv/bin/python -m pytest tests/test_scanner_filters.py -v
```
Tests do not require DB connection — all test pure Python logic.

## What must be tested
Changes to these areas require tests before merge:
- **Billing**: any change to `PLAN_PRICES`, plan activation logic, or signature verification
- **Scanner filters**: any new filter added to `_apply_filters()` in `scanner.py`
- **Rate limiting**: any change to `RateLimiter` or `PlanCache` in `services/rate_limit.py`

## Test style in this repo
- pytest classes (`class TestX:`) with descriptive method names
- No fixtures — test data is inline
- No mocking of DB or external services — tests are scoped to pure functions
- If you need to test a function that hits the DB, extract the pure logic into a helper first, then test the helper

## What is NOT tested (known gaps)
- Auth middleware (JWT validation)
- Razorpay webhook handler
- Bhavcopy ingest
- Journal analytics calculations
- AI prompt construction
- All frontend behavior

## Adding a new test file
1. Create `backend/tests/test_<module>.py`
2. Test pure logic only — no DB, no HTTP calls
3. Run `cd backend && .venv/bin/python -m pytest tests/ -v` to confirm all pass

## Never do
- Skip tests for changes to billing price tables or signature verification
- Write tests that call the live Supabase DB
- Write tests that call external APIs (Razorpay, Anthropic, Zerodha)
- Add a test that requires a running server (`TestClient` is acceptable for pure router logic tests if needed, but not yet in use)
