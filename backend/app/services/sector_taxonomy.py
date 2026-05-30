from __future__ import annotations

from collections import Counter
from typing import Any

SECTOR_TAXONOMY_SOURCE = "stock_universe.sector"
SECTOR_TAXONOMY_CONTRACT_AS_OF = "2026-05-30"
NSE_SECTORAL_INDEX_REFERENCE_URL = "https://www.nseindia.com/static/products-services/indices-sectoral"
NSE_SECTORAL_INDEX_REFERENCE_AS_OF = "2026-03-02"

NSE_SECTORAL_INDEXES: list[dict[str, Any]] = [
    {"symbol": "NIFTY AUTO", "label": "Nifty Auto Index", "aliases": ["Auto", "Automobile"]},
    {"symbol": "NIFTY BANK", "label": "Nifty Bank Index", "aliases": ["Banks", "Banking"]},
    {"symbol": "NIFTY CEMENT", "label": "Nifty Cement Index", "aliases": ["Cement"]},
    {"symbol": "NIFTY CHEMICALS", "label": "Nifty Chemicals Index", "aliases": ["Chemicals"]},
    {
        "symbol": "NIFTY FIN SERVICE",
        "label": "Nifty Financial Services Index",
        "aliases": ["Finance", "Financial Services"],
    },
    {
        "symbol": "NIFTY FIN SERV 25/50",
        "label": "Nifty Financial Services 25/50 Index",
        "aliases": ["Financial Services 25/50"],
    },
    {
        "symbol": "NIFTY FINANCIAL SERVICES EX-BANK",
        "label": "Nifty Financial Services Ex-Bank Index",
        "aliases": ["Financial Services Ex-Bank"],
    },
    {"symbol": "NIFTY FMCG", "label": "Nifty FMCG Index", "aliases": ["FMCG"]},
    {
        "symbol": "NIFTY HEALTHCARE INDEX",
        "label": "Nifty Healthcare Index",
        "aliases": ["Healthcare", "Pharma"],
    },
    {
        "symbol": "NIFTY IT",
        "label": "Nifty IT Index",
        "aliases": ["IT", "IT Services", "Information Technology"],
    },
    {"symbol": "NIFTY MEDIA", "label": "Nifty Media Index", "aliases": ["Media", "Media & Entertainment"]},
    {"symbol": "NIFTY METAL", "label": "Nifty Metal Index", "aliases": ["Metal", "Metals & Mining"]},
    {"symbol": "NIFTY PHARMA", "label": "Nifty Pharma Index", "aliases": ["Pharma", "Healthcare"]},
    {"symbol": "NIFTY PVT BANK", "label": "Nifty Private Bank Index", "aliases": ["Private banks"]},
    {"symbol": "NIFTY PSU BANK", "label": "Nifty PSU Bank Index", "aliases": ["PSU banks"]},
    {"symbol": "NIFTY REALTY", "label": "Nifty Realty Index", "aliases": ["Realty"]},
    {
        "symbol": "NIFTY REITS & REALTY",
        "label": "Nifty REITs & Realty Index",
        "aliases": ["REITs", "Realty"],
    },
    {
        "symbol": "NIFTY CONSUMER DURABLES",
        "label": "Nifty Consumer Durables Index",
        "aliases": ["Consumer Durables"],
    },
    {"symbol": "NIFTY OIL AND GAS", "label": "Nifty Oil and Gas Index", "aliases": ["Oil and Gas", "Energy"]},
    {"symbol": "NIFTY500 HEALTHCARE", "label": "Nifty500 Healthcare Index", "aliases": ["Nifty500 Healthcare"]},
    {
        "symbol": "NIFTY MIDSML FINANCIAL SERVICES",
        "label": "Nifty MidSmall Financial Services Index",
        "aliases": ["MidSmall Financial Services"],
    },
    {
        "symbol": "NIFTY MIDSML HEALTHCARE",
        "label": "Nifty MidSmall Healthcare Index",
        "aliases": ["MidSmall Healthcare"],
    },
    {
        "symbol": "NIFTY MIDSML IT & TELECOM",
        "label": "Nifty MidSmall IT & Telecom Index",
        "aliases": ["MidSmall IT & Telecom"],
    },
]

_RELATED_INDEXES_BY_SECTOR: dict[str, list[str]] = {}
_ALIASES_BY_SECTOR: dict[str, list[str]] = {}
for index in NSE_SECTORAL_INDEXES:
    for alias in index["aliases"]:
        _RELATED_INDEXES_BY_SECTOR.setdefault(alias, [])
        if index["label"] not in _RELATED_INDEXES_BY_SECTOR[alias]:
            _RELATED_INDEXES_BY_SECTOR[alias].append(index["label"])
        _ALIASES_BY_SECTOR.setdefault(alias, [])
        for related_alias in index["aliases"]:
            if related_alias != alias and related_alias not in _ALIASES_BY_SECTOR[alias]:
                _ALIASES_BY_SECTOR[alias].append(related_alias)


def build_sector_taxonomy_metadata(
    rows: list[dict[str, Any]],
    *,
    active_count: int | None = None,
    active_count_scope: str = "active_universe",
    hidden_min_active_symbols: int = 1,
    unmapped_symbol_limit: int = 50,
) -> dict[str, Any]:
    count_by_sector = Counter(
        str(row.get("sector")).strip()
        for row in rows
        if row.get("sector") is not None and str(row.get("sector")).strip()
    )
    unmapped_symbols = sorted(
        str(row.get("symbol")).strip().upper()
        for row in rows
        if row.get("symbol") and not (row.get("sector") is not None and str(row.get("sector")).strip())
    )

    sector_counts = [
        {
            "sector": sector,
            "active_count": count,
            "aliases": _ALIASES_BY_SECTOR.get(sector, []),
            "related_sectoral_indices": _RELATED_INDEXES_BY_SECTOR.get(sector, []),
            "hidden_by_filter": count < hidden_min_active_symbols,
        }
        for sector, count in sorted(count_by_sector.items(), key=lambda item: (-item[1], item[0]))
    ]
    hidden_count = sum(1 for item in sector_counts if item["hidden_by_filter"])
    classified_count = sum(count_by_sector.values())
    total_active = active_count if active_count is not None else classified_count + len(unmapped_symbols)
    sectors_without_reference = [
        item["sector"]
        for item in sector_counts
        if not item["related_sectoral_indices"]
    ]

    return {
        "source": SECTOR_TAXONOMY_SOURCE,
        "contract_as_of": SECTOR_TAXONOMY_CONTRACT_AS_OF,
        "reference": {
            "name": "NSE sectoral indices",
            "url": NSE_SECTORAL_INDEX_REFERENCE_URL,
            "as_of": NSE_SECTORAL_INDEX_REFERENCE_AS_OF,
            "relationship": "reference_only_not_equity_universe_source",
        },
        "universe_taxonomy": {
            "name": "AlphaVyuh equity universe sectors",
            "source": SECTOR_TAXONOMY_SOURCE,
            "relationship": (
                "stock classification labels used for filters, scanner rows, breadth, "
                "watchlist, chart, and portfolio exposure"
            ),
        },
        "alias_policy": {
            "source": "NSE sectoral index aliases",
            "description": (
                "Sector-count aliases are derived only from NSE sectoral-index alias labels. "
                "An empty aliases list means AlphaVyuh has no audited NSE alias for that sector label yet."
            ),
        },
        "sectoral_indices": NSE_SECTORAL_INDEXES,
        "active_count": total_active,
        "active_count_scope": active_count_scope,
        "classified_count": classified_count,
        "unmapped_count": len(unmapped_symbols),
        "unmapped_symbols": unmapped_symbols[:unmapped_symbol_limit],
        "unmapped_symbols_truncated": len(unmapped_symbols) > unmapped_symbol_limit,
        "sector_counts": sector_counts,
        "sector_count": len(sector_counts),
        "reference_coverage": {
            "matched_sector_count": len(sector_counts) - len(sectors_without_reference),
            "unmatched_sector_count": len(sectors_without_reference),
            "unmatched_sectors": sectors_without_reference,
            "description": (
                "Every AlphaVyuh sector has at least one related NSE sectoral-index reference."
                if not sectors_without_reference
                else "Some AlphaVyuh sector labels do not map to an NSE sectoral-index reference."
            ),
        },
        "display_filter": {
            "minimum_active_symbols": hidden_min_active_symbols,
            "hidden_sector_count": hidden_count,
            "description": (
                "All mapped sectors are shown."
                if hidden_min_active_symbols <= 1
                else f"Sectors with fewer than {hidden_min_active_symbols} active symbols are hidden from this summary."
            ),
        },
    }
