#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "../frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

const qaEmail = (process.env.PLAYWRIGHT_QA_EMAIL || "qa.smoke@alphavyuh.local").trim().toLowerCase();
const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const githubEnv = process.env.GITHUB_ENV;
const SUPABASE_COOKIE_PREFIX = "base64-";
const SUPABASE_COOKIE_CHUNK_SIZE = 3180;

function required(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function exportSecret(name, value) {
  if (!githubEnv) return;
  const delimiter = `ALPHAVYUH_${name}_${randomBytes(6).toString("hex")}`;
  if (process.env.GITHUB_ACTIONS === "true") {
    process.stdout.write(`::add-mask::${value}\n`);
  }
  appendFileSync(githubEnv, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function supabaseStorageKey(url) {
  const hostname = new URL(url).hostname;
  return `sb-${hostname.split(".")[0]}-auth-token`;
}

function supabaseAuthCookieChunks(url, session) {
  const key = supabaseStorageKey(url);
  const encoded = `${SUPABASE_COOKIE_PREFIX}${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  if (encoded.length <= SUPABASE_COOKIE_CHUNK_SIZE) {
    return [{ name: key, value: encoded }];
  }

  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += SUPABASE_COOKIE_CHUNK_SIZE) {
    chunks.push({
      name: `${key}.${chunks.length}`,
      value: encoded.slice(offset, offset + SUPABASE_COOKIE_CHUNK_SIZE),
    });
  }
  return chunks;
}

async function main() {
  required("SUPABASE_URL", supabaseUrl);
  required("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey);

  const password = `AvyuhQaSmoke-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(8).toString("hex")}!`;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  let user = listed.data.users.find((candidate) => candidate.email?.toLowerCase() === qaEmail);

  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: qaEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: "QA Smoke" },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(user.user_metadata || {}), full_name: "QA Smoke" },
    });
    if (updated.error) throw updated.error;
    user = updated.data.user;
  }

  const profile = await admin
    .from("users")
    .upsert(
      {
        id: user.id,
        email: qaEmail,
        full_name: "QA Smoke",
        plan: "pro",
        plan_expires_at: null,
        onboarding_completed: true,
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();
  if (profile.error) throw profile.error;

  const lists = await admin
    .from("watchlists")
    .select("id,name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (lists.error) throw lists.error;

  let watchlistId = lists.data?.[0]?.id;
  if (!watchlistId) {
    const inserted = await admin
      .from("watchlists")
      .insert({ user_id: user.id, name: "QA Production Smoke", sort_order: 0 })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    watchlistId = inserted.data.id;
  }

  const smokeSymbols = ["RELIANCE", "ITC", "AUBANK"];
  const items = smokeSymbols.map((symbol, index) => ({
    watchlist_id: watchlistId,
    symbol,
    sort_order: index,
  }));
  const seeded = await admin
    .from("watchlist_items")
    .upsert(items, { onConflict: "watchlist_id,symbol" })
    .select("symbol");
  if (seeded.error) throw seeded.error;

  const signedIn = await anon.auth.signInWithPassword({ email: qaEmail, password });
  if (signedIn.error || !signedIn.data.session?.access_token) {
    throw signedIn.error || new Error("No Supabase session returned for QA smoke account.");
  }

  exportSecret("PLAYWRIGHT_QA_EMAIL", qaEmail);
  exportSecret("PLAYWRIGHT_QA_PASSWORD", password);
  exportSecret("PRODUCTION_API_BEARER_TOKEN", signedIn.data.session.access_token);
  exportSecret("PLAYWRIGHT_SUPABASE_AUTH_COOKIES", JSON.stringify(supabaseAuthCookieChunks(supabaseUrl, signedIn.data.session)));

  console.log(
    JSON.stringify(
      {
        qaUserId: user.id,
        email: qaEmail,
        watchlistId,
        seededSymbols: seeded.data?.map((row) => row.symbol).sort(),
        exportedSupabaseAuthCookies: supabaseAuthCookieChunks(supabaseUrl, signedIn.data.session).map((cookie) => cookie.name),
        exportedToGithubEnv: Boolean(githubEnv),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
