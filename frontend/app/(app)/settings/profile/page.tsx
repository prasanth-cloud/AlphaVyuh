"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMe, updateMe } from "@/lib/api";
import type { UserProfile } from "@/lib/api";

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((p) => {
        setProfile(p);
        setFullName(p.full_name ?? "");
        setTelegramChatId(p.telegram_chat_id ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function save() {
    setSaving(true);
    try {
      const updates: { full_name?: string; telegram_chat_id?: string } = {};
      if (fullName !== (profile?.full_name ?? "")) updates.full_name = fullName;
      // Always send telegram_chat_id so user can clear it
      if (telegramChatId !== (profile?.telegram_chat_id ?? "")) {
        updates.telegram_chat_id = telegramChatId;
      }
      if (Object.keys(updates).length === 0) {
        showToast("No changes to save", false);
        return;
      }
      const updated = await updateMe(updates);
      setProfile(updated);
      setFullName(updated.full_name ?? "");
      setTelegramChatId(updated.telegram_chat_id ?? "");
      showToast("Profile updated", true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Save failed", false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-[#f2f2f0] px-5 py-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings/billing" className="text-[12px] text-[#aaa] hover:text-[#1c1c1a] transition-colors">
          Billing
        </Link>
        <span className="text-[#ddd]">/</span>
        <span className="text-[12px] font-medium text-[#1c1c1a]">Profile</span>
      </div>
      <div className="text-[20px] font-semibold text-[#1c1c1a] tracking-tight mb-1">Profile & Notifications</div>
      <div className="text-[13px] text-[#888] mb-6">Update your display name and connect Telegram for scan alerts.</div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-[#e2e2df] rounded-[10px] p-5 animate-pulse h-16" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Account info card */}
          <div className="bg-white border border-[#e2e2df] rounded-[10px] p-5">
            <div className="text-[11px] text-[#aaa] uppercase tracking-wider mb-4">Account</div>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-[#555] block mb-1.5">Email</label>
                <div className="text-[13px] text-[#888] bg-[#f7f7f5] rounded-lg px-3 py-2.5">
                  {profile?.email}
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#555] block mb-1.5">Display name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  className="w-full text-[13px] bg-[#f7f7f5] border border-[#e2e2df] rounded-lg px-3 py-2.5 outline-none focus:border-[#5b63f5] transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Telegram card */}
          <div className="bg-white border border-[#e2e2df] rounded-[10px] p-5">
            <div className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1">Telegram Alerts</div>
            <div className="text-[12px] text-[#888] mb-4 leading-relaxed">
              Get notified on Telegram when your saved scan alerts trigger after market close.
              Follow these steps to link your account:
            </div>
            <ol className="text-[12px] text-[#666] space-y-2 mb-4 list-decimal list-inside leading-relaxed">
              <li>
                Open Telegram and search for{" "}
                <span className="font-mono bg-[#f0f0ee] px-1.5 py-0.5 rounded text-[11px]">@userinfobot</span>
              </li>
              <li>Send it any message — it replies with your Chat ID (a number like <span className="font-mono text-[11px]">123456789</span>)</li>
              <li>Paste that number below and save</li>
            </ol>
            <div>
              <label className="text-[12px] font-medium text-[#555] block mb-1.5">Telegram Chat ID</label>
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="e.g. 123456789"
                className="w-full text-[13px] bg-[#f7f7f5] border border-[#e2e2df] rounded-lg px-3 py-2.5 outline-none focus:border-[#5b63f5] transition-colors font-mono"
              />
            </div>
            {profile?.telegram_chat_id && (
              <div className="mt-2 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#26a65b]" />
                <span className="text-[11px] text-[#26a65b] font-medium">Connected</span>
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="flex items-center justify-between">
            <div />
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2.5 bg-[#1c1c1a] text-white text-[13px] font-medium rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white shadow-lg transition-all"
          style={{ background: toast.ok ? "#26a65b" : "#e5383b" }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
