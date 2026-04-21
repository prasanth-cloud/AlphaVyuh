"""
vcp.py — VCP (Volatility Contraction Pattern) detection.

Implements ADR 005 §VCP Detection Specification.

Usage (two-pass, called from scanner.py):
  Pass 1: SEPA pre-filter via DB push-filters → candidate symbol list
  Pass 2: Fetch last LOOKBACK_DAYS rows per candidate; call detect_vcp() per symbol

Pattern criteria (Minervini / ADR 005):
  1. Price in uptrend  — close > sma_200 (enforced in Pass 1 pre-filter)
  2. Contracting bases — ≥ min_pivots consecutive pivot-high-to-pivot-high bases where
                         each base's depth (high-to-low % of pivot high) must be
                         strictly less than the prior base × MIN_CONTRACTION_RATIO
  3. Volume contraction — mean volume in each base is lower than in the prior base
  4. Final base tight  — depth of the last base ≤ max_depth_pct (default 15%)
  5. Pivot proximity   — |current_close - last_pivot_high| / last_pivot_high
                         must be ≤ pivot_proximity_pct (catches both below-pattern
                         breakdown AND above-pattern breakout that has already run)

Gap / edge-case handling:
  - Insufficient history  : < MIN_ROWS_REQUIRED rows → False (fresh listings / halts)
  - Missing trading days  : rows need not be consecutive; algorithm uses sorted row order
  - Zero-volume bars      : excluded from mean_vol to avoid distorting the volume
                            contraction check on circuit-breaker / halt days
  - Zero-price bars       : if any close == 0 or high == 0, return False (data error guard)
  - Known limitation      : PIVOT_WINDOW counts in row-index space, not calendar days.
                            Symbols with multi-week halts may have distorted base durations
                            in terms of calendar time, though the contraction logic is sound.
"""
from __future__ import annotations

LOOKBACK_DAYS      = 75    # trading days to fetch per candidate in Pass 2
MIN_ROWS_REQUIRED  = 40    # fewer rows → insufficient history
PIVOT_WINDOW       = 3     # bars on each side required to qualify as a pivot high
MIN_CONTRACTION_RATIO = 0.95  # depth[i] must be strictly < depth[i-1] * MIN_CONTRACTION_RATIO


# Keep CONTRACTION_MARGIN as a backwards-compatible alias used by tests
CONTRACTION_MARGIN = MIN_CONTRACTION_RATIO


def _find_pivot_highs(highs: list[float], window: int = PIVOT_WINDOW) -> list[int]:
    """
    Return sorted indices of pivot highs.

    A bar at index i is a pivot high if its high is strictly greater than
    every other bar in the window [i-window, i+window]. This strict condition
    means flat regions never produce spurious pivots — only clear local peaks
    qualify. Each qualifying bar is guaranteed to be unique in its window.
    """
    n = len(highs)
    result: list[int] = []
    for i in range(window, n - window):
        hi = highs[i]
        if hi > max(highs[i - window : i]) and hi > max(highs[i + 1 : i + window + 1]):
            result.append(i)
    return result


def _compute_bases(
    highs: list[float],
    lows: list[float],
    volumes: list[float],
    pivot_indices: list[int],
) -> list[dict]:
    """
    For each consecutive pair of pivot highs, compute:
      pivot_high  — the high at the left pivot
      depth_pct   — (pivot_high - min_low_in_base) / pivot_high * 100
      mean_vol    — mean daily volume across the base period, excluding zero-volume bars

    Returns one dict per base (len = len(pivot_indices) - 1).
    """
    bases: list[dict] = []
    for i in range(len(pivot_indices) - 1):
        start = pivot_indices[i]
        end   = pivot_indices[i + 1]
        ph    = highs[start]
        if ph == 0:
            continue
        seg_lows = lows[start : end + 1]
        seg_vols = volumes[start : end + 1]
        if not seg_lows:
            continue
        min_low   = min(seg_lows)
        depth_pct = (ph - min_low) / ph * 100
        # Exclude zero-volume bars (circuit-breaker / halt days) from the mean so they
        # don't artificially lower mean_vol and create false volume-contraction signals.
        active_vols = [v for v in seg_vols if v > 0]
        mean_vol    = sum(active_vols) / len(active_vols) if active_vols else 0.0
        bases.append({
            "pivot_high": ph,
            "depth_pct":  depth_pct,
            "mean_vol":   mean_vol,
            "start_idx":  start,
            "end_idx":    end,
        })
    return bases


def detect_vcp(
    rows: list[dict],
    min_pivots: int = 2,
    max_depth_pct: float = 15.0,
    pivot_proximity_pct: float = 10.0,
) -> bool:
    """
    Detect a Volatility Contraction Pattern in a sorted sequence of OHLCV rows.

    Args:
        rows: list of OHLCV dicts sorted ascending by trade_date.
              Required keys: ``high``, ``low``, ``close``, ``volume``.
        min_pivots: minimum number of contracting bases (Minervini default: 2).
        max_depth_pct: maximum depth of the FINAL base as % of pivot high (default 15%).
        pivot_proximity_pct: |current_close - last_pivot_high| / last_pivot_high must
                             be ≤ this value (default 10%). Catches both below-pattern
                             breakdowns and above-pattern breakouts that have already run.

    Returns:
        True if a valid VCP is detected; False otherwise.

    Notes:
        - Criterion 1 (uptrend / above 200-day MA) is enforced in the SEPA
          Pass 1 pre-filter and is NOT re-checked here.
        - The function intentionally returns False for ambiguous / data-poor
          cases rather than raising exceptions, so callers can treat it as a
          simple predicate.
    """
    if len(rows) < MIN_ROWS_REQUIRED:
        return False

    highs   = [float(r["high"])             for r in rows]
    lows    = [float(r["low"])              for r in rows]
    closes  = [float(r["close"])            for r in rows]
    volumes = [float(r.get("volume") or 0)  for r in rows]

    # Guard against bad data
    if not closes or closes[-1] == 0:
        return False
    if any(h == 0 for h in highs):
        return False

    pivot_idx = _find_pivot_highs(highs)

    # Need at least min_pivots + 1 pivot highs to form min_pivots bases
    if len(pivot_idx) < min_pivots + 1:
        return False

    # Anchor on the most recent (min_pivots + 1) pivot highs so the pattern
    # is fresh and not buried in old history
    pivot_idx = pivot_idx[-(min_pivots + 1):]
    bases = _compute_bases(highs, lows, volumes, pivot_idx)

    if len(bases) < min_pivots:
        return False

    # Criterion 2: each base must be strictly shallower than prior × MIN_CONTRACTION_RATIO
    for i in range(1, len(bases)):
        if bases[i]["depth_pct"] >= bases[i - 1]["depth_pct"] * MIN_CONTRACTION_RATIO:
            return False

    # Criterion 3: mean volume must decrease in each successive base
    for i in range(1, len(bases)):
        if bases[i]["mean_vol"] >= bases[i - 1]["mean_vol"]:
            return False

    # Criterion 4: final base must be tight
    if bases[-1]["depth_pct"] > max_depth_pct:
        return False

    # Criterion 5: current price must be within pivot_proximity_pct of the last
    # pivot high — catches both breakdown (far below) and runaway breakout (far above).
    last_pivot_high = highs[pivot_idx[-1]]
    current_close   = closes[-1]
    if last_pivot_high == 0:
        return False
    distance_pct = abs(last_pivot_high - current_close) / last_pivot_high * 100
    if distance_pct > pivot_proximity_pct:
        return False

    return True
