"use client";

import Link from "next/link";
import { Filter, List, CandlestickChart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type QuickLaunchTilesProps = {
  hasData: boolean;
};

const tiles: { href: string; Icon: LucideIcon; title: string; subtitle: string }[] = [
  {
    href: "/scanner",
    Icon: Filter,
    title: "Run a scan",
    subtitle: "Find stocks matching your criteria",
  },
  {
    href: "/watchlist",
    Icon: List,
    title: "Build a watchlist",
    subtitle: "Track your top candidates",
  },
  {
    href: "/scanner",
    Icon: CandlestickChart,
    title: "Open a chart",
    subtitle: "Analyze setups in detail",
  },
];

export function QuickLaunchTiles({ hasData }: QuickLaunchTilesProps) {
  const compact = hasData;
  const iconSize = compact ? 16 : 24;
  const padding = compact ? "12px 16px" : "20px";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 8,
      }}
    >
      {tiles.map((tile) => (
        <Link
          key={tile.href + tile.title}
          href={tile.href}
          style={{
            background: "#12161D",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding,
            textDecoration: "none",
            display: "flex",
            flexDirection: compact ? "row" : "column",
            alignItems: compact ? "center" : "flex-start",
            gap: compact ? 10 : 12,
            transition: "background 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#1A1F28";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#12161D";
          }}
        >
          <tile.Icon size={iconSize} color="#00D9A7" aria-hidden="true" />
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#F1EFE8",
                lineHeight: 1.3,
              }}
            >
              {tile.title}
            </div>
            {!compact && (
              <div
                style={{
                  fontSize: 12,
                  color: "#A8A29E",
                  marginTop: 4,
                  lineHeight: 1.4,
                }}
              >
                {tile.subtitle}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
