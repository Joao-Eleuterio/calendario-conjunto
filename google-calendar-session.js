import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const PEOPLE = ["joao", "ines"];
const PENDING_KEY = "cc_google_oauth_person";
const CALENDAR_SCOPES = "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly";

// Supabase conserva a sessão de quem usa o aparelho. Os tokens Google ficam só no servidor.
const storage = {
  getItem: key => localStorage.getItem(key),
  removeItem: key => localStorage.removeItem(key),
  setItem: (key, value) => {
    try {
      const session = JSON.parse(value);
      if (session && typeof session === "object") {
        delete session.provider_token;
        delete session.provider_refresh_token;
        value = JSON.stringify(session);
      }
    } catch { /* O verificador PKCE é texto simples. */ }
    localStorage.setItem(key, value);
  },
};
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: "cc-google-auth-viewer", storage, flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
});

async function invoke(body) {
  const { data, error } = await client.functions.invoke("google-calendar", { body });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(details?.error || "Não foi possível consultar o calendário. Confirma a configuração do Supabase.");
  }
  return data;
}

let callbackResult = null;
const ready = (async () => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  let pending;
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY)); } catch { /* Ignora redirecionamentos antigos. */ }
  if (!code || !PEOPLE.includes(pending?.person) || !["view", "connect"].includes(pending.mode)) return;
  url.searchParams.delete("code");
  history.replaceState({}, "", url.toString());
  localStorage.removeItem(PENDING_KEY);
  try {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (pending.mode === "connect") {
      if (!data.session?.provider_refresh_token) throw new Error("A Google não enviou uma autorização persistente. Volta a ligar a conta.");
      await invoke({ action: "connect", person: pending.person, refreshToken: data.session.provider_refresh_token });
    }
    callbackResult = { person: pending.person, success: true };
  } catch (error) {
    callbackResult = { person: pending.person, error: error.message };
  }
})();

export const persistentCalendar = {
  ready,
  callbackResult: () => callbackResult,
  async authorize(person, mode) {
    if (!PEOPLE.includes(person) || !["view", "connect"].includes(mode)) throw new Error("Pedido inválido.");
    localStorage.setItem(PENDING_KEY, JSON.stringify({ person, mode }));
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: mode === "connect" ? CALENDAR_SCOPES : "openid email",
        redirectTo: `${window.location.origin}${window.location.pathname}`,
        queryParams: mode === "connect" ? { access_type: "offline", prompt: "consent select_account" } : { prompt: "select_account" },
      },
    });
    if (error) { localStorage.removeItem(PENDING_KEY); throw error; }
  },
  connect(person) { return this.authorize(person, "connect"); },
  signIn(person) { return this.authorize(person, "view"); },
  async status(person) {
    await ready;
    const { data: { session } } = await client.auth.getSession();
    if (!session) return { signedIn: false, connected: false };
    return { signedIn: true, ...(await invoke({ action: "status", person })) };
  },
  async data(person, range) {
    return invoke({ action: "data", person, start: range.start.toISOString(), end: range.end.toISOString() });
  },
  async disconnect(person) {
    await invoke({ action: "disconnect", person });
  },
  async signOut() { await client.auth.signOut(); },
};
