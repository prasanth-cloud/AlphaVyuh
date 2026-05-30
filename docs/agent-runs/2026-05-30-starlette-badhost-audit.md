# 2026-05-30 - Starlette BadHost Audit Gate

## Scope
- Fixed #291, the shared Agent regression gate blocker caused by `pip-audit` reporting `starlette==0.50.0` as vulnerable to `PYSEC-2026-161`.
- Bumped FastAPI and Starlette together to a compatible pair:
  - `fastapi==0.136.3`
  - `starlette==1.0.1`

## Validation
- `python -m pip install -r backend/requirements.txt`
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- `SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=test-service-role-key SUPABASE_JWT_SECRET=playwright-secret python -m pytest backend/tests -q`

## Result
- `pip-audit`: no known vulnerabilities found.
- Backend tests: 285 passed.

## Notes
- The failure was not caused by PR #288 broker code; #288 passed backend tests before failing at the shared dependency audit step.
- Open feature PRs that still include the old requirements will need this dependency fix merged/rebased before their Agent regression gates can pass.
