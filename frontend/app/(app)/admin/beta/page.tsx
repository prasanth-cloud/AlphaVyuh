"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw, Ticket } from "lucide-react";
import { createInviteCode, getAdminWaitlist, type WaitlistLead } from "@/lib/api";

export default function BetaAdminPage() {
  const [leads, setLeads] = useState<WaitlistLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setLeads(await getAdminWaitlist());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Admin waitlist unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreateInvite() {
    setCreating(true);
    setError("");
    try {
      const result = await createInviteCode({ email: email.trim() || undefined, max_uses: 1, plan: "founder" });
      setInvite(result.code);
      if (navigator.clipboard) await navigator.clipboard.writeText(result.code).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not create invite");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        padding: "22px 24px",
        borderRadius: 24,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg, rgba(13,22,26,0.94), rgba(10,14,18,0.96))",
        boxShadow: "var(--shadow-panel)",
      }}>
        <div className="label" style={{ color: "var(--accent)", marginBottom: 10 }}>Founder beta</div>
        <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.02, letterSpacing: "-0.04em", marginBottom: 8 }}>Customer onboarding queue.</h1>
        <p style={{ maxWidth: 740, fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)" }}>
          Review landing-page beta leads and issue invite codes before activating founder-plan access.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 360px) 1fr", gap: 16 }}>
        <div className="rounded-[18px] p-5" style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Ticket size={16} style={{ color: "var(--accent)" }} />
            <div className="heading-card">Create invite</div>
          </div>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="lead@example.com"
            className="w-full rounded-[8px] px-3 py-2.5 text-[13px] outline-none mb-3"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
          />
          <button
            onClick={handleCreateInvite}
            disabled={creating}
            className="w-full rounded-[8px] px-4 py-2.5 text-[13px] font-semibold disabled:opacity-60"
            style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#061110" }}
          >
            {creating ? "Creating..." : "Create founder invite"}
          </button>
          {invite && (
            <button
              onClick={() => navigator.clipboard.writeText(invite)}
              className="mt-3 w-full flex items-center justify-between rounded-[8px] px-3 py-2.5 text-[13px] font-mono"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
            >
              {invite}
              <Copy size={14} />
            </button>
          )}
        </div>

        <div className="rounded-[18px] p-5" style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="heading-card">Beta leads</div>
              <div className="caption">{leads.length} latest requests</div>
            </div>
            <button onClick={load} className="workspace-chip-button flex items-center gap-2">
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>

          {error && <div className="text-[12px] mb-3" style={{ color: "var(--loss)" }}>{error}</div>}
          {loading ? (
            <div className="caption">Loading...</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="w-full text-left text-[12px]">
                <thead style={{ color: "var(--text-tertiary)" }}>
                  <tr>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Invite</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="py-2 pr-3" style={{ color: "var(--text-primary)" }}>{lead.email}</td>
                      <td className="py-2 pr-3" style={{ color: "var(--text-secondary)" }}>{lead.source}</td>
                      <td className="py-2 pr-3 font-mono" style={{ color: "var(--text-secondary)" }}>{lead.invite_code || "-"}</td>
                      <td className="py-2 pr-3" style={{ color: "var(--accent)" }}>{lead.status}</td>
                      <td className="py-2" style={{ color: "var(--text-tertiary)" }}>{new Date(lead.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
