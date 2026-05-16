# AlphaVyuh Blockers Ledger

Use this file when an agent cannot safely continue without owner input, credentials, production access, or a business decision.

## Current Owner-Gated Areas

- Production Supabase actions: require explicit owner approval and evidence after application.
- Broker validation: requires owner-provided Kite/Upstox tokens for read-only smoke; any sandbox/live order path requires explicit order-level confirmation.
- Billing: production Razorpay or paid checkout remains owner-approved only.
- Market data rights: paid/live vendor choice and redistribution terms require owner decision.
- Legal/support copy: final public copy, disclaimers, and support commitments require owner approval.
- Production launch posture: public launch versus private/founder beta remains an owner decision.

## Blocker Entry Template

```md
## YYYY-MM-DD - Short blocker title

- Owner:
- Blocking:
- Why it matters:
- Required decision or input:
- Safe work completed:
- Safe next step after input:
```

