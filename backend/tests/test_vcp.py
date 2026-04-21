"""
Unit tests for VCP pivot detection (app/scanners/vcp.py).
No DB required — all data is synthetic.

Key design constraints:
  - N bases require N+1 spike bars (detect_vcp takes pivot_idx[-(N+1):])
  - Row count must be >= MIN_ROWS_REQUIRED (40)
  - Each spike must be a strict local max: highs[i] > all ±PIVOT_WINDOW neighbours

Data layout (_vcp_rows):
  lead_n flat trough bars + for each spike: [pad flat bars, 1 spike, pad flat bars] + current bar.
  Flat bars are all equal so no bar is a strict local max — only spike bars qualify as pivots.

Test inventory (20 tests across 5 classes):
  TestClassicVCP (3):
    1.  2-base VCP (3 spikes)                             → True
    2.  3-base VCP (4 spikes)                             → True
    3.  Single-base VCP (min_pivots=1, 2 spikes)          → True
  TestContractionFailures (4):
    4.  Expanding depth in second base                     → False
    5.  Volume expanding in second base                    → False
    6.  Equal volumes (not strictly decreasing)            → False
    7.  Contraction margin boundary — exactly at threshold → False
  TestTightnessAndProximity (4):
    8.  Final base too deep with tight limit               → False
    9.  Final base passes with generous limit              → True
    10. Price too far from pivot (75% factor)              → False
    11. Price within proximity (97% factor)                → True
  TestEdgeCases (5):
    12. Insufficient rows (< MIN_ROWS_REQUIRED)            → False
    13. Exactly MIN_ROWS_REQUIRED rows (no pivots)         → False
    14. Too few pivot highs for min_pivots                 → False
    15. Zero close bar                                     → False
    16. Zero high bar                                      → False
  TestPivotDetection (4 unit tests for _find_pivot_highs):
    17. Single clear spike → only that index returned
    18. Two separated spikes → both returned
    19. Spike too close to edge → excluded
    20. Flat line → no pivots (strict comparison)
"""
import pytest
from app.scanners.vcp import (
    detect_vcp,
    _find_pivot_highs,
    MIN_ROWS_REQUIRED,
    CONTRACTION_MARGIN,
    PIVOT_WINDOW,
)

# ── Synthetic row helpers ─────────────────────────────────────────────────────

_QUIET_VOL = 300_000


def _q(n: int, price: float, vol: float = _QUIET_VOL) -> list[dict]:
    """n quiet/flat bars at given price."""
    return [{"high": price + 0.5, "low": price - 0.5, "close": price, "volume": vol}
            for _ in range(n)]


def _spike(high: float, vol: float) -> dict:
    """One spike bar — clearly the local max within ±PIVOT_WINDOW."""
    return {"high": high, "low": high * 0.97, "close": high * 0.98, "volume": vol}


def _trough(n: int, low: float, vol: float) -> list[dict]:
    """n flat trough bars. All bars identical — none qualify as strict local max."""
    return [{"high": low + 1.0, "low": low, "close": low, "volume": vol}
            for _ in range(n)]


def _vcp_rows(
    spikes:  list[float],
    troughs: list[float],
    vols:    list[float],
    pad:     int = 7,
    lead_n:  int = 12,
    current_close_factor: float = 0.95,
) -> list[dict]:
    """
    Assemble a full VCP sequence using flat trough pads around each spike.

    Layout:
        lead_n flat bars at trough[0]
        for each spike i:
            pad flat bars at trough[i]   ← approach (all equal, no pivot)
            1 spike bar                  ← strict local max → detected as pivot
            pad flat bars at trough[i]   ← settle  (all equal, no pivot)
        1 current bar

    Because flat bars are all equal, _find_pivot_highs (strict mode) only marks
    spike bars as pivots. This guarantees the last N+1 pivots are the N spikes.

    Row counts (pad=7, lead=12):
        2 spikes: 12 + 2*(7+1+7) + 1 = 43 rows  (>= MIN_ROWS_REQUIRED=40)
        3 spikes: 12 + 3*(7+1+7) + 1 = 58 rows
        4 spikes: 12 + 4*(7+1+7) + 1 = 73 rows
    """
    rows: list[dict] = []

    rows.extend(_trough(lead_n, troughs[0], vols[0]))

    for ph, tl, vol in zip(spikes, troughs, vols):
        rows.extend(_trough(pad, tl, vol))
        rows.append(_spike(ph, vol))
        rows.extend(_trough(pad, tl, vol))

    last_ph = spikes[-1]
    cc = last_ph * current_close_factor
    rows.append({"high": cc + 0.5, "low": cc - 0.5, "close": cc, "volume": _QUIET_VOL})

    return rows


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestClassicVCP:
    """Happy-path cases: valid VCP should return True."""

    def test_two_base_vcp(self):
        # 3 spikes → 2 bases (min_pivots=2)
        # Flat-pad depth = (pivot_high - min(adjacent troughs)) / pivot_high.
        # base0: min(92,98)=92  → (110-92)/110 = 16.4%
        # base1: min(98,103)=98 → (108-98)/108 = 9.26%  → contracting ✓, 9.26 < 16.4*0.95=15.6
        rows = _vcp_rows(
            spikes=[110.0, 108.0, 106.0],
            troughs=[92.0, 98.0, 103.0],
            vols=[1_200_000, 900_000, 600_000],
        )
        assert len(rows) >= MIN_ROWS_REQUIRED
        assert detect_vcp(rows, min_pivots=2, max_depth_pct=15.0) is True

    def test_three_base_vcp(self):
        # 4 spikes → 3 bases (min_pivots=3)
        # base depths (min of adjacent troughs):
        #   base0: min(92,98)=92  → (110-92)/110=16.4%
        #   base1: min(98,103)=98 → (108-98)/108=9.3%
        #   base2: min(103,100)=100 → (106-100)/106=5.7%  all contracting
        # trough3=100 (not 104) so spike3=107 > 100+1=101 — strict local max
        rows = _vcp_rows(
            spikes=[110.0, 108.0, 106.0, 107.0],
            troughs=[92.0, 98.0, 103.0, 100.0],
            vols=[1_400_000, 1_100_000, 800_000, 500_000],
        )
        assert len(rows) >= MIN_ROWS_REQUIRED
        assert detect_vcp(rows, min_pivots=3, max_depth_pct=10.0) is True

    def test_single_base_vcp_min_pivots_1(self):
        # 2 spikes → 1 base (min_pivots=1)
        # base depth: (110-92)/110 = 16.4% (just fits under 17%)
        rows = _vcp_rows(
            spikes=[110.0, 108.0],
            troughs=[92.0, 101.0],
            vols=[1_200_000, 800_000],
        )
        assert len(rows) >= MIN_ROWS_REQUIRED
        assert detect_vcp(rows, min_pivots=1, max_depth_pct=17.0) is True


class TestContractionFailures:
    """Cases where the pattern breaks down — should return False."""

    def test_expanding_depth_fails(self):
        # Flat-pad base depth = (pivot_high - min(adjacent troughs)) / pivot_high.
        # tl0=100>tl1=98>tl2=95 → base0 uses min(100,98)=98, base1 uses min(98,95)=95.
        # base0 depth: (110-98)/110 = 10.91%
        # base1 depth: (108-95)/108 = 12.04%  → EXPANDING (12.04 > 10.91 * 0.95=10.36)
        rows = _vcp_rows(
            spikes=[110.0, 108.0, 106.0],
            troughs=[100.0, 98.0, 95.0],
            vols=[1_200_000, 900_000, 600_000],
        )
        assert detect_vcp(rows, min_pivots=2) is False

    def test_volume_expanding_fails(self):
        # Depths contract but volume EXPANDS — invalid
        rows = _vcp_rows(
            spikes=[110.0, 108.0, 106.0],
            troughs=[92.0, 98.0, 103.0],
            vols=[600_000, 900_000, 1_200_000],   # reversed: growing
        )
        assert detect_vcp(rows, min_pivots=2) is False

    def test_volume_equal_fails(self):
        # Same volume in all bases — must be strictly decreasing
        rows = _vcp_rows(
            spikes=[110.0, 108.0, 106.0],
            troughs=[92.0, 98.0, 103.0],
            vols=[900_000, 900_000, 900_000],
        )
        assert detect_vcp(rows, min_pivots=2) is False

    def test_contraction_margin_boundary_fails(self):
        """
        base1_depth == base0_depth * CONTRACTION_MARGIN (exactly at threshold).
        The check is `>=`, so this must return False.

        With all troughs equal (tl), flat-pad min = tl for every base:
          D0 = (ph0 - tl) / ph0,  D1 = (ph1 - tl) / ph1
        Solve D1 == D0 * 0.95:
          tl = 0.05 * ph0 * ph1 / (ph0 - 0.95 * ph1)
        Depths are ~28%, so max_depth_pct=50 is used to isolate the boundary check.
        """
        ph0, ph1, ph2 = 100.0, 98.0, 96.0
        tl = 0.05 * ph0 * ph1 / (ph0 - 0.95 * ph1)  # ≈ 71.01

        rows = _vcp_rows(
            spikes=[ph0, ph1, ph2],
            troughs=[tl, tl, tl],
            vols=[1_200_000, 900_000, 600_000],
        )
        assert detect_vcp(rows, min_pivots=2, max_depth_pct=50.0) is False


class TestTightnessAndProximity:
    """Final base depth and current price proximity checks."""

    def test_final_base_too_deep_fails_with_tight_limit(self):
        # base1 depth (108-98)/108 = 9.26%; limit = 8% → fails
        rows = _vcp_rows(
            spikes=[110.0, 108.0, 106.0],
            troughs=[92.0, 98.0, 103.0],
            vols=[1_200_000, 900_000, 600_000],
        )
        assert detect_vcp(rows, min_pivots=2, max_depth_pct=8.0) is False

    def test_final_base_passes_with_generous_limit(self):
        rows = _vcp_rows(
            spikes=[110.0, 108.0, 106.0],
            troughs=[92.0, 98.0, 103.0],
            vols=[1_200_000, 900_000, 600_000],
        )
        assert detect_vcp(rows, min_pivots=2, max_depth_pct=15.0) is True

    def test_price_too_far_from_pivot_fails(self):
        # current_close_factor=0.75 → 25% below last pivot → proximity fail
        rows = _vcp_rows(
            spikes=[110.0, 108.0, 106.0],
            troughs=[92.0, 98.0, 103.0],
            vols=[1_200_000, 900_000, 600_000],
            current_close_factor=0.75,
        )
        assert detect_vcp(rows, min_pivots=2, pivot_proximity_pct=10.0) is False

    def test_price_within_proximity_passes(self):
        # current_close_factor=0.97 → 3% below last pivot → within 10% ✓
        rows = _vcp_rows(
            spikes=[110.0, 108.0, 106.0],
            troughs=[92.0, 98.0, 103.0],
            vols=[1_200_000, 900_000, 600_000],
            current_close_factor=0.97,
        )
        assert detect_vcp(rows, min_pivots=2, max_depth_pct=15.0) is True


class TestEdgeCases:
    """Edge cases: guard rails, insufficient data, bad data."""

    def test_insufficient_rows_returns_false(self):
        rows = _q(MIN_ROWS_REQUIRED - 1, 100.0)
        assert detect_vcp(rows) is False

    def test_exactly_min_rows_does_not_raise(self):
        # Flat data → no pivot highs → False but no exception
        rows = _q(MIN_ROWS_REQUIRED, 100.0)
        assert detect_vcp(rows) is False

    def test_too_few_pivot_highs_for_min_pivots_fails(self):
        # 2 spikes → only 1 base; min_pivots=2 requires 2 bases → False
        rows = _vcp_rows(
            spikes=[110.0, 108.0],
            troughs=[92.0, 101.0],
            vols=[1_200_000, 800_000],
        )
        assert detect_vcp(rows, min_pivots=2) is False

    def test_zero_close_returns_false(self):
        rows = _q(50, 100.0)
        rows[25]["close"] = 0.0  # corrupt bar
        assert detect_vcp(rows) is False

    def test_zero_high_returns_false(self):
        rows = _q(50, 100.0)
        rows[10]["high"] = 0.0
        assert detect_vcp(rows) is False


class TestPivotDetection:
    """Direct unit tests for _find_pivot_highs."""

    def test_clear_single_spike(self):
        n = 20
        highs = [50.0] * n
        highs[10] = 100.0  # single spike; strict comparison → only index 10 qualifies
        pivots = _find_pivot_highs(highs, window=PIVOT_WINDOW)
        assert pivots == [10]

    def test_two_separated_spikes(self):
        n = 30
        highs = [50.0] * n
        highs[5]  = 100.0
        highs[24] = 95.0
        pivots = _find_pivot_highs(highs, window=PIVOT_WINDOW)
        assert 5 in pivots
        assert 24 in pivots

    def test_spike_too_close_to_edge_excluded(self):
        # Spike within PIVOT_WINDOW of start → not enough left-side bars
        highs = [50.0] * 20
        highs[1] = 100.0  # index 1 < PIVOT_WINDOW=3 → excluded
        pivots = _find_pivot_highs(highs, window=PIVOT_WINDOW)
        assert 1 not in pivots

    def test_flat_line_has_no_pivots(self):
        highs = [100.0] * 20
        # All bars equal — none are strictly greater than their neighbours → zero pivots
        pivots = _find_pivot_highs(highs, window=PIVOT_WINDOW)
        assert pivots == []
