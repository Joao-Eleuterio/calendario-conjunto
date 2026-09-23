import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const encryptionSecret = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY")!;
const allowedOrigin = Deno.env.get("GOOGLE_CALENDAR_ORIGIN") || "https://joao-eleuterio.github.io";
const authorizedEmails: Record<string, string> = {
  joao: (Deno.env.get("GOOGLE_JOAO_EMAIL") || "").trim().toLowerCase(),
  ines: (Deno.env.get("GOOGLE_INES_EMAIL") || "").trim().toLowerCase(),
};
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

function cors(request: Request) {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin ? origin : allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(request) });
}
function decode(value: string) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
function encode(value: Uint8Array) { return btoa(String.fromCharCode(...value)); }
async function cryptoKey() {
  const bytes = decode(encryptionSecret);
  if (bytes.length !== 32) throw new Error("Chave de encriptação inválida.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), new TextEncoder().encode(token)));
  return { token_ciphertext: encode(encrypted), token_iv: encode(iv) };
}
async function decrypt(row: { token_ciphertext: string; token_iv: string }) {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(row.token_iv) }, await cryptoKey(), decode(row.token_ciphertext));
  return new TextDecoder().decode(plaintext);
}
async function refreshToken(refresh: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: googleClientId, client_secret: googleClientSecret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error(response.status === 400 ? "A autorização Google expirou. Volta a ligar a conta." : "Não foi possível renovar o acesso Google.");
  return response.json();
}
async function googleGet(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google Calendar devolveu ${response.status}.`);
  return response.json();
}
async function pages(url: string, token: string) {
  const result: Record<string, unknown>[] = [];
  const target = new URL(url);
  do {
    const page = await googleGet(target.toString(), token);
    result.push(...(page.items || []));
    if (!page.nextPageToken) break;
    target.searchParams.set("pageToken", page.nextPageToken);
  } while (true);
  return result;
}
async function calendarData(token: string, start: string, end: string) {
  const calendars = await pages("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&fields=items(id,summary,summaryOverride,backgroundColor,colorId,selected),nextPageToken", token);
  const palette = await googleGet("https://www.googleapis.com/calendar/v3/colors", token).catch(() => ({ calendar: {}, event: {} }));
  const results = await Promise.allSettled(calendars.map(async calendar => {
    const params = new URLSearchParams({ timeMin: start, timeMax: end, singleEvents: "true", orderBy: "startTime", maxResults: "2500", fields: "items(id,summary,start,end,htmlLink,status,colorId),nextPageToken" });
    const events = await pages(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(calendar.id))}/events?${params}`, token);
    return events.filter(event => event.status !== "cancelled").map(event => ({ ...event, calendarId: calendar.id, calendarName: calendar.summaryOverride || calendar.summary || "Calendário" }));
  }));
  const failures = results.filter(result => result.status === "rejected").length;
  if (failures && failures === calendars.length) throw new Error("Não foi possível ler os calendários. Confirma as permissões Google.");
  return { calendars, palette, events: results.flatMap(result => result.status === "fulfilled" ? result.value : []), failures };
}

serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors(request) });
  if (request.method !== "POST") return json(request, { error: "Método inválido." }, 405);
  if (request.headers.get("origin") !== allowedOrigin) return json(request, { error: "Origem não autorizada." }, 403);
  try {
    const jwt = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return json(request, { error: "Inicia sessão para ver o calendário." }, 401);
    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user || !user.identities?.some(identity => identity.provider === "google")) return json(request, { error: "Sessão Google inválida." }, 401);
    if (!authorizedEmails.joao || !authorizedEmails.ines || authorizedEmails.joao === authorizedEmails.ines) throw new Error("Configura os emails de João e Inês no servidor.");
    const viewerPerson = Object.keys(authorizedEmails).find(person => authorizedEmails[person] === user.email?.toLowerCase());
    if (!viewerPerson) return json(request, { error: "Esta conta não tem acesso aos calendários." }, 403);
    const body = await request.json();
    if (body.person !== "joao" && body.person !== "ines") return json(request, { error: "Pessoa inválida." }, 400);
    const { data: row, error: readError } = await admin.from("google_calendar_connections").select("*").eq("person", body.person).maybeSingle();
    if (readError) throw readError;

    if (body.action === "status") return json(request, { connected: !!row, email: row?.google_email || null, viewerPerson });
    if ((body.action === "connect" || body.action === "disconnect") && viewerPerson !== body.person) return json(request, { error: "Só a própria pessoa pode ligar ou desligar a sua conta." }, 403);
    if (body.action === "connect") {
      if (typeof body.refreshToken !== "string" || body.refreshToken.length > 2048) return json(request, { error: "Falta a autorização Google de longa duração." }, 400);
      const token = await refreshToken(body.refreshToken);
      const profile = await googleGet("https://www.googleapis.com/oauth2/v3/userinfo", token.access_token);
      if (!profile.email_verified || profile.email?.toLowerCase() !== authorizedEmails[body.person]) return json(request, { error: "A conta Google autorizada não corresponde à pessoa selecionada." }, 403);
      const encrypted = await encrypt(body.refreshToken);
      const { error } = await admin.from("google_calendar_connections").upsert({ person: body.person, owner_user_id: user.id, google_email: profile.email, ...encrypted, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json(request, { connected: true, email: profile.email });
    }
    if (body.action === "disconnect") {
      if (row) {
        const refresh = await decrypt(row);
        await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refresh }) }).catch(() => {});
        const { error } = await admin.from("google_calendar_connections").delete().eq("person", body.person).eq("owner_user_id", user.id);
        if (error) throw error;
      }
      return json(request, { connected: false });
    }
    if (body.action === "data") {
      if (!row) return json(request, { error: "Liga a conta Google uma vez para começar." }, 404);
      const start = new Date(body.start), end = new Date(body.end);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 32 * 86400000) return json(request, { error: "Intervalo de datas inválido." }, 400);
      const refresh = await decrypt(row);
      const token = await refreshToken(refresh);
      if (token.refresh_token && token.refresh_token !== refresh) {
        const encrypted = await encrypt(token.refresh_token);
        const { error } = await admin.from("google_calendar_connections").update({ ...encrypted, updated_at: new Date().toISOString() }).eq("person", body.person);
        if (error) throw error;
      }
      return json(request, await calendarData(token.access_token, start.toISOString(), end.toISOString()));
    }
    return json(request, { error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("Google Calendar function error", error instanceof Error ? error.message : error);
    return json(request, { error: error instanceof Error ? error.message : "Erro ao consultar o calendário." }, 500);
  }
});
