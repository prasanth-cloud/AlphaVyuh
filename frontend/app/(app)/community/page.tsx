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
    <div className="min-h-full bg-[#f2f2f0]">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e2df] px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[20px] font-semibold text-[#1c1c1a] tracking-tight">Community Screens</div>
            <div className="text-[12px] text-[#aaa] mt-0.5">
              Discover and upvote scan strategies shared by other traders
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-[#aaa]" />
            <div className="inline-flex rounded-lg border border-[#e2e2df] bg-white overflow-hidden">
              {(["top", "latest"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-3 py-1.5 text-[12px] font-medium transition-colors capitalize"
                  style={filter === f ? { background: "#1c1c1a", color: "#fff" } : { color: "#888" }}
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
              <div key={i} className="bg-white border border-[#e2e2df] rounded-[12px] p-5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-48 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-72" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-[13px] text-red-400 py-8">{error}</div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-full bg-[#eeeffe] flex items-center justify-center">
              <ThumbsUp size={22} className="text-[#5b63f5]" />
            </div>
            <div className="text-[15px] font-semibold text-[#555]">No shared screens yet</div>
            <div className="text-[13px] text-[#aaa] text-center max-w-xs">
              Be the first to share a scan strategy with the community.
              Go to the{" "}
              <Link href="/scanner" className="text-[#5b63f5] hover:underline font-medium">Scanner</Link>
              {" "}and save a screen to share it here.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((screen, i) => (
              <div
                key={screen.id}
                className="bg-white border border-[#e2e2df] rounded-[12px] p-5 flex items-start gap-4"
              >
                {/* Rank */}
                <div className="text-[13px] font-bold text-[#ccc] w-6 shrink-0 mt-0.5">
                  {filter === "top" ? `#${i + 1}` : ""}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold text-[#1c1c1a]">{screen.title}</div>
                      {screen.description && (
                        <div className="text-[12px] text-[#888] mt-0.5 line-clamp-2">{screen.description}</div>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  {screen.tags && screen.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {screen.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#f0f0ee] text-[#888]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-3 text-[11px] text-[#aaa]">
                    <span>Shared by <span className="font-medium text-[#555]">{screen.user_id.slice(0, 8)}</span></span>
                    <span>·</span>
                    <span>{timeAgo(screen.created_at)}</span>
                    {screen.is_featured && (
                      <>
                        <span>·</span>
                        <span className="text-[10px] font-bold text-[#d97706] bg-[#fff8ec] px-2 py-0.5 rounded-full">
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
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-[10px] border border-[#e2e2df] hover:border-[#5b63f5] hover:bg-[#eeeffe] transition-colors group shrink-0 disabled:opacity-50"
                >
                  <ThumbsUp
                    size={15}
                    className="text-[#aaa] group-hover:text-[#5b63f5] transition-colors"
                  />
                  <span className="text-[12px] font-bold text-[#888] group-hover:text-[#5b63f5]">
                    {screen.upvotes}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 text-center text-[11px] text-[#aaa]">
          Want to share a screen?{" "}
          <Link href="/scanner" className="text-[#5b63f5] hover:underline">Go to Scanner</Link>
          {" "}→ save a filter set → Share to Community
        </div>
      </div>
    </div>
  );
}
