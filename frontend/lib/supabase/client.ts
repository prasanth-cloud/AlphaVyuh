import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createMissingSupabaseClient() {
  const emptyResult = { data: null, error: null };
  const emptyAuth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error("Supabase is not configured") }),
    signUp: async () => ({ data: { user: null, session: null }, error: new Error("Supabase is not configured") }),
    verifyOtp: async () => ({ data: { user: null, session: null }, error: new Error("Supabase is not configured") }),
    resetPasswordForEmail: async () => ({ data: null, error: new Error("Supabase is not configured") }),
    updateUser: async () => ({ data: { user: null }, error: new Error("Supabase is not configured") }),
  };
  const emptyQuery = {
    select() { return this; },
    or() { return this; },
    eq() { return this; },
    order() { return this; },
    limit: async () => ({ data: [], error: null }),
    single: async () => emptyResult,
    maybeSingle: async () => emptyResult,
    insert: async () => ({ data: null, error: new Error("Supabase is not configured") }),
    update: async () => ({ data: null, error: new Error("Supabase is not configured") }),
    upsert: async () => ({ data: null, error: new Error("Supabase is not configured") }),
    delete: async () => ({ data: null, error: new Error("Supabase is not configured") }),
  };

  return {
    auth: emptyAuth,
    from: () => emptyQuery,
  };
}

export function createClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    return createMissingSupabaseClient() as unknown as SupabaseClient;
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  );
}
