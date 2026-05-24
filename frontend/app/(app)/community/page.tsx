"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThumbsUp, Filter } from "lucide-react";
import { getSharedScreens, upvoteScreen, type SharedScreen } from "@/lib/api";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  return `${m}mo ago`;
}

export default function CommunityPage() {
  const [screens, setScreens] = useState<SharedScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [voting, setVoting] = useState<string | null>(null);
  const [filter, setFilter] = useState<"latest" | "top">("top");

  useEffect(() => {
    setLoading(true);
    getSharedScreens()
      .then(setScreens)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpvote(screen: SharedScreen) {
    if (voting) return;
    setVoting(screen.id);
    try {
      const updated = await upvoteScreen(screen.id);
      setScreens(prev => prev.map(s => s.id === screen.id ? { ...s, upvotes: updated.upvotes } : s));
    } catch {
      // silent
    } finally {
      setVoting(null);
    }
  }

  const sorted = [...screens].sort((a, b) =>
    filter === "top"
      ? b.upvotes - a.upvotes
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="min-h-full" style={{ background: "var(--app-bg)", color: "var(--app-text1)" }}>
      {/* Header */}
      <div className="border-b px-5 py-5" style={{ background: "var(--app-surface1)", borderColor: "var(--app-border)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[20px] font-semibold tracking-tight">Community Screens</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--app-text3)" }}>
              Shared scan strategy examples for review
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} style={{ color: "var(--app-text3)" }} />
            <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--app-border)", background: "var(--app-surface2)" }}>
              {(["top", "latest"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-3 py-1.5 text-[12px] font-medium transition-colors capitalize"
                  style={filter === f ? { background: "var(--app-accent)", color: "#04120d" } : { color: "var(--app-text3)" }}
                >
                  {f === "top" ? "Top" : "Latest"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 max-w-3xl">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="border rounded-[12px] p-5 animate-pulse" style={{ background: "var(--app-surface1)", borderColor: "var(--app-border)" }}>
                <div className="h-4 rounded w-48 mb-2" style={{ background: "var(--app-surface3)" }} />
                <div className="h-3 rounded w-72 max-w-full" style={{ background: "var(--app-surface3)" }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div
            data-testid="community-screens-unavailable"
            className="rounded-[16px] px-5 py-6 text-[13px]"
            style={{
              background: "var(--warn-subtle)",
              border: "1px solid rgba(217,119,6,0.24)",
              color: "var(--warn)",
            }}
          >
            <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--app-text1)" }}>Community screens unavailable</div>
            <div>{error}</div>
            <div className="mt-2" style={{ color: "var(--app-text3)" }}>
              Shared screens are not being treated as empty while the community service is unavailable.
            </div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "var(--app-surface2)" }}>
              <ThumbsUp size={22} style={{ color: "var(--app-accent)" }} />
            </div>
            <div className="text-[15px] font-semibold">No shared screens yet</div>
            <div className="text-[13px] text-center max-w-xs" style={{ color: "var(--app-text3)" }}>
              Be the first to share a scan strategy with the community.
              Go to the{" "}
              <Link href="/scanner" className="hover:underline font-medium" style={{ color: "var(--app-accent)" }}>Scanner</Link>
              {" "}and save a screen to share it here.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((screen, i) => (
              <div
                key={screen.id}
                className="border rounded-[12px] p-5 flex items-start gap-4"
                style={{ background: "var(--app-surface1)", borderColor: "var(--app-border)" }}
              >
                {/* Rank */}
                <div className="text-[13px] font-bold w-6 shrink-0 mt-0.5" style={{ color: "var(--app-text3)" }}>
                  {filter === "top" ? `#${i + 1}` : ""}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold">{screen.title}</div>
                      {screen.description && (
                        <div className="text-[12px] mt-0.5 line-clamp-2" style={{ color: "var(--app-text3)" }}>{screen.description}</div>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  {screen.tags && screen.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {screen.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{ background: "var(--app-surface3)", color: "var(--app-text2)" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-3 text-[11px]" style={{ color: "var(--app-text3)" }}>
                    <span>Shared by <span className="font-medium" style={{ color: "var(--app-text2)" }}>{screen.user_id.slice(0, 8)}</span></span>
                    <span>·</span>
                    <span>{timeAgo(screen.created_at)}</span>
                    {screen.is_featured && (
                      <>
                        <span>·</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)" }}>
                          Featured
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Upvote */}
                <button
                  onClick={() => handleUpvote(screen)}
                  disabled={voting === screen.id}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-[10px] border transition-colors group shrink-0 disabled:opacity-50"
                  style={{ borderColor: "var(--app-border)", background: "var(--app-surface2)" }}
                >
                  <ThumbsUp
                    size={15}
                    className="transition-colors"
                    style={{ color: "var(--app-text3)" }}
                  />
                  <span className="text-[12px] font-bold" style={{ color: "var(--app-text2)" }}>
                    {screen.upvotes}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 text-center text-[11px]" style={{ color: "var(--app-text3)" }}>
          Want to share a screen?{" "}
          <Link href="/scanner" className="hover:underline" style={{ color: "var(--app-accent)" }}>Go to Scanner</Link>
          {" "}→ save a filter set → Share to Community
        </div>
      </div>
    </div>
  );
}
