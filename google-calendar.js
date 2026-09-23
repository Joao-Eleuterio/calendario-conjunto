import { GOOGLE_CLIENT_ID } from "./config.js";
import { eventDays, localDateKey, timeLabel } from "./google-calendar-data.js";

const SCOPE = "openid email https://www.googleapis.com/auth/calendar.events.readonly";
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const LABELS = { joao: "João", ines: "Inês" };
const sessions = { joao: null, ines: null }; // access tokens never enter localStorage or Supabase
const month = { year: new Date().getFullYear(), index: new Date().getMonth() };
let selectedDay = localDateKey(new Date());
let requestId = 0;

function elt(id) { return document.getElementById(id); }
function status(message) { elt("google-status").textContent = message; }
function bindingKey(person) { return `cc_google_account_${person}`; }
function sessionFor(person) {
  const session = sessions[person];
  return session && Date.now() < session.expiresAt ? session : null;
}

async function googleFetch(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) {
    const error = new Error(response.status === 401 ? "A sessão Google expirou. Volta a ligar a conta." : `Erro Google (${response.status}). Tenta atualizar.`);
    error.expired = response.status === 401;
    throw error;
  }
  return response.json();
}

async function loadEvents(person, session, identity) {
  const start = new Date(month.year, month.index, 1);
  const end = new Date(month.year, month.index + 1, 1);
  const params = new URLSearchParams({
    timeMin: start.toISOString(), timeMax: end.toISOString(),
    singleEvents: "true", orderBy: "startTime", maxResults: "2500",
    fields: "items(id,summary,start,end,htmlLink,status),nextPageToken",
  });
  const events = [];
  do {
    const page = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, session.token);
    events.push(...(page.items || []));
    if (!page.nextPageToken) break;
    params.set("pageToken", page.nextPageToken);
  } while (identity === requestId && person === identityPerson());
  return events.filter(event => event.status !== "cancelled");
}

let getPerson;
function identityPerson() { return getPerson(); }

function renderGrid(events) {
  const first = new Date(month.year, month.index, 1);
  const last = new Date(month.year, month.index + 1, 1);
  const byDay = new Map();
  for (const event of events) {
    for (const day of eventDays(event, first, last)) {
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(event);
    }
  }
  elt("google-month-title").textContent = `${MONTHS[month.index]} ${month.year}`;
  const grid = elt("google-grid");
  grid.replaceChildren();
  for (let i = 0; i < (first.getDay() + 6) % 7; i++) grid.appendChild(document.createElement("span"));
  for (let day = 1; day <= new Date(month.year, month.index + 1, 0).getDate(); day++) {
    const date = localDateKey(new Date(month.year, month.index, day));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-cell google-cell";
    if (date === localDateKey(new Date())) button.classList.add("today");
    if (date === selectedDay) button.classList.add("selected");
    button.setAttribute("aria-label", `${day} de ${MONTHS[month.index]}, ${(byDay.get(date) || []).length} eventos`);
    const number = document.createElement("span"); number.className = "num"; number.textContent = day;
    button.appendChild(number);
    if (byDay.has(date)) {
      const dot = document.createElement("span"); dot.className = "google-dot";
      button.appendChild(dot);
    }
    button.addEventListener("click", () => { selectedDay = date; renderGrid(events); });
    grid.appendChild(button);
  }
  const date = new Date(`${selectedDay}T12:00:00`);
  elt("google-day-title").textContent = `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
  const list = elt("google-events"); list.replaceChildren();
  const todayEvents = byDay.get(selectedDay) || [];
  if (!todayEvents.length) {
    const empty = document.createElement("p"); empty.className = "google-empty"; empty.textContent = "Sem eventos neste dia."; list.appendChild(empty);
  }
  for (const event of todayEvents) {
    const item = document.createElement("div"); item.className = "google-event";
    const time = document.createElement("span"); time.className = "google-time";
    time.textContent = timeLabel(event);
    const title = document.createElement(event.htmlLink?.startsWith("https://calendar.google.com/") ? "a" : "span");
    title.textContent = event.summary || "(Sem título)";
    if (title.tagName === "A") { title.href = event.htmlLink; title.target = "_blank"; title.rel = "noopener noreferrer"; }
    item.append(time, title); list.appendChild(item);
  }
}

export function initGoogleCalendar(personGetter) {
  getPerson = personGetter;
  async function render() {
    const person = getPerson();
    const identity = ++requestId;
    const session = sessionFor(person);
    elt("google-owner").textContent = `Calendário principal de ${LABELS[person]}`;
    elt("google-account").textContent = session ? `Conta: ${session.email}` : "";
    elt("google-connect").hidden = !!session;
    elt("google-disconnect").hidden = !session;
    elt("google-refresh").hidden = !session;
    elt("google-change-account").hidden = !localStorage.getItem(bindingKey(person));
    elt("google-calendar").hidden = !session;
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes("COLOCA_AQUI")) {
      status("Falta configurar o Google OAuth Client ID em config.js."); return;
    }
    if (!session) { status("Liga a tua conta Google para consultar os eventos. A ligação poderá ter de ser repetida mais tarde."); return; }
    status("A carregar eventos…");
    try {
      const events = await loadEvents(person, session, identity);
      if (identity !== requestId || person !== getPerson()) return;
      renderGrid(events);
      elt("google-calendar").hidden = false;
      status("");
    } catch (error) {
      if (identity !== requestId || person !== getPerson()) return;
      if (error.expired) sessions[person] = null;
      elt("google-calendar").hidden = true;
      status(error.message);
      if (error.expired) { elt("google-connect").hidden = false; elt("google-disconnect").hidden = true; elt("google-refresh").hidden = true; }
    }
  }

  elt("google-connect").addEventListener("click", () => {
    const person = getPerson();
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes("COLOCA_AQUI")) { status("Configura primeiro o Google OAuth Client ID."); return; }
    if (!window.google?.accounts?.oauth2) { status("Não foi possível carregar o acesso Google. Verifica a ligação e tenta novamente."); return; }
    status("A aguardar autorização Google…");
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: SCOPE,
      callback: async response => {
        if (response.error || !response.access_token) { status("Autorização Google não concluída."); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, "openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly")) {
          if (person === getPerson()) status("É preciso autorizar o acesso de leitura ao calendário e ao email da conta.");
          return;
        }
        try {
          const profile = await googleFetch("https://www.googleapis.com/oauth2/v3/userinfo", response.access_token);
          if (!profile.email || !profile.email_verified) throw new Error("Não foi possível confirmar o email da conta Google.");
          const saved = localStorage.getItem(bindingKey(person));
          if (saved && saved !== profile.email.toLowerCase()) {
            if (person === getPerson()) {
              status(`Esta vista está associada a ${saved}. Selecionaste ${profile.email}. Entra na conta correta ou usa “Alterar conta associada”.`);
              elt("google-change-account").hidden = false;
            }
            return;
          }
          if (!saved) localStorage.setItem(bindingKey(person), profile.email.toLowerCase());
          sessions[person] = { token: response.access_token, email: profile.email, expiresAt: Date.now() + Math.max(0, Number(response.expires_in) - 60) * 1000 };
          if (person === getPerson()) { elt("google-change-account").hidden = true; void render(); }
        } catch (error) { if (person === getPerson()) status(error.message); }
      },
      error_callback: () => { if (person === getPerson()) status("Janela de autorização fechada ou bloqueada. Tenta novamente."); },
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
  elt("google-disconnect").addEventListener("click", () => {
    sessions[getPerson()] = null;
    void render();
  });
  elt("google-change-account").addEventListener("click", () => {
    if (!confirm(`Alterar a conta Google associada à vista de ${LABELS[getPerson()]} neste navegador?`)) return;
    localStorage.removeItem(bindingKey(getPerson()));
    sessions[getPerson()] = null;
    elt("google-change-account").hidden = true;
    status("Conta anterior removida. Liga agora a conta Google correta.");
  });
  elt("google-refresh").addEventListener("click", render);
  for (const [id, delta] of [["google-prev", -1], ["google-next", 1]]) {
    elt(id).addEventListener("click", () => {
      const date = new Date(month.year, month.index + delta, 1);
      month.year = date.getFullYear(); month.index = date.getMonth();
      selectedDay = localDateKey(date);
      void render();
    });
  }
  return { render };
}
