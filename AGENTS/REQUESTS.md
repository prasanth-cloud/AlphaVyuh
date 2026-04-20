# Cross-agent requests

When an agent needs something outside its ownership, it writes a request here.
The owning agent picks it up next session.

Format:
```
### REQ-NNN: Short title
**From:** requesting-agent
**To:** target-agent
**Created:** YYYY-MM-DD
**Status:** open | in-progress | done

Description of what's needed and why.
```

## Open

### REQ-001: Breadth sector endpoint
**From:** feature
**To:** data
**Created:** 2026-04-19
**Status:** in-progress (see AGENTS/data.md current task)

Feature agent needs `/api/v1/market/breadth/sectors` to render dashboard sector breadth card. Should return `{sectors: [{sector, breadth_pct, count, avg_pct_change}]}` for latest trade date.

## Done

(empty)
