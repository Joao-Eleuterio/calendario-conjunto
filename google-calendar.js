import { GOOGLE_CLIENT_ID } from "./config.js";
import { calendarColor, calendarRange, colorText, eventColor, eventDays, localDateKey, shiftCalendarDate, timeLabel } from "./google-calendar-data.js";

const CALENDAR_LIST_SCOPE = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const SCOPE = `openid email ${CALENDAR_LIST_SCOPE} ${EVENTS_SCOPE}`;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const LABELS = { joao: "João", ines: "Inês" };
const sessions = { joao: null, ines: null }; // access tokens never enter localStorage or Supabase
let selectedDay = localDateKey(new Date());
let calendarView = "month";
let requestId = 0;
let currentData = null;
const visibleByPerson = { joao: new Map(), ines: new Map() };

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

async function loadCalendars(token) {
  const params = new URLSearchParams({ maxResults: "250", fields: "items(id,summary,summaryOverride,backgroundColor,colorId,selected),nextPageToken" });
  const calendars = [];
  do {
    const page = await googleFetch(`https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`, token);
    calendars.push(...(page.items || []));
    if (!page.nextPageToken) break;
    params.set("pageToken", page.nextPageToken);
  } while (true);
  return calendars;
}

async function loadCalendarEvents(calendar, session, identity, range) {
  const params = new URLSearchParams({
    timeMin: range.start.toISOString(), timeMax: range.end.toISOString(),
    singleEvents: "true", orderBy: "startTime", maxResults: "2500",
    fields: "items(id,summary,start,end,htmlLink,status,colorId),nextPageToken",
  });
  const events = [];
  do {
    const page = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params}`, session.token);
    events.push(...(page.items || []));
    if (!page.nextPageToken) break;
    params.set("pageToken", page.nextPageToken);
  } while (identity === requestId);
  return events.filter(event => event.status !== "cancelled").map(event => ({ ...event, calendarId: calendar.id, calendarName: calendar.summaryOverride || calendar.summary || "Calendário", calendarColor: calendar.color }));
}

let getPerson;

function renderCalendarChoices(data, person) {
  const container = elt("google-calendars");
  container.replaceChildren();
  for (const calendar of data.calendars) {
    const label = document.createElement("label"); label.className = "google-calendar-choice";
    const input = document.createElement("input"); input.type = "checkbox";
    input.checked = visibleByPerson[person].get(calendar.id);
    const dot = document.createElement("span"); dot.className = "google-choice-dot"; dot.style.backgroundColor = calendar.color;
    const name = document.createElement("span"); name.textContent = calendar.summaryOverride || calendar.summary || "Calendário";
    input.addEventListener("change", () => {
      visibleByPerson[person].set(calendar.id, input.checked);
      if (person === getPerson() && currentData === data) renderCalendarView(data);
    });
    label.append(input, dot, name); container.appendChild(label);
  }
}

function sortedEvents(events) {
  return [...events].sort((a, b) => {
    if (!!a.start?.date !== !!b.start?.date) return a.start?.date ? -1 : 1;
    return new Date(a.start?.dateTime || `${a.start?.date}T00:00:00`) - new Date(b.start?.dateTime || `${b.start?.date}T00:00:00`);
  });
}

function eventCard(event, palette, dayKey) {
  const color = eventColor(event, palette);
  const card = document.createElement("article");
  card.className = "google-event-card";
  card.style.backgroundColor = color;
  card.style.color = colorText(color);
  const time = document.createElement("span"); time.className = "google-card-time";
  const startDay = event.start?.dateTime && localDateKey(new Date(event.start.dateTime));
  time.textContent = startDay && startDay !== dayKey ? "Continua" : timeLabel(event);
  const title = document.createElement(event.htmlLink?.startsWith("https://calendar.google.com/") ? "a" : "span");
  title.className = "google-card-title";
  title.textContent = event.summary || "(Sem título)";
  if (title.tagName === "A") { title.href = event.htmlLink; title.target = "_blank"; title.rel = "noopener noreferrer"; }
  const source = document.createElement("small"); source.textContent = event.calendarName;
  card.append(time, title, source);
  return card;
}

function renderAgenda(container, events, palette, dayKey) {
  container.replaceChildren();
  if (!events.length) {
    const empty = document.createElement("p"); empty.className = "google-empty";
    empty.textContent = "Sem eventos neste dia."; container.appendChild(empty);
  }
  for (const event of sortedEvents(events)) container.appendChild(eventCard(event, palette, dayKey));
}

function renderCalendarView(data) {
  const range = calendarRange(calendarView, selectedDay);
  const byDay = new Map();
  for (const event of data.events.filter(item => visibleByPerson[getPerson()].get(item.calendarId))) {
    for (const day of eventDays(event, range.start, range.end)) {
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(event);
    }
  }
  const date = new Date(`${selectedDay}T12:00:00`);
  const endDay = new Date(range.end); endDay.setDate(endDay.getDate() - 1);
  elt("google-month-title").textContent = calendarView === "month"
    ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
    : calendarView === "week"
      ? `${range.start.getDate()} ${MONTHS[range.start.getMonth()].slice(0, 3)} – ${endDay.getDate()} ${MONTHS[endDay.getMonth()].slice(0, 3)} ${endDay.getFullYear()}`
      : new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "numeric", month: "long" }).format(date);
  document.querySelectorAll("[data-google-view]").forEach(button => {
    const active = button.dataset.googleView === calendarView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const isMonth = calendarView === "month";
  elt("google-weekdays").hidden = !isMonth;
  elt("google-grid").hidden = !isMonth;
  elt("google-week").hidden = calendarView !== "week";
  elt("google-day-title").hidden = calendarView !== "month";
  elt("google-events").hidden = calendarView === "week";

  if (isMonth) {
    const grid = elt("google-grid"); grid.replaceChildren();
    for (let i = 0; i < (range.start.getDay() + 6) % 7; i++) grid.appendChild(document.createElement("span"));
    for (let day = 1; day <= endDay.getDate(); day++) {
      const key = localDateKey(new Date(date.getFullYear(), date.getMonth(), day));
      const items = sortedEvents(byDay.get(key) || []);
      const button = document.createElement("button");
      button.type = "button"; button.className = "google-cell";
      if (key === localDateKey(new Date())) button.classList.add("today");
      if (key === selectedDay) button.classList.add("selected");
      button.setAttribute("aria-label", `${day} de ${MONTHS[date.getMonth()]}, ${items.length} eventos`);
      const number = document.createElement("span"); number.className = "google-cell-number"; number.textContent = day;
      button.appendChild(number);
      for (const event of items.slice(0, 2)) {
        const chip = document.createElement("span"); chip.className = "google-event-chip";
        const color = eventColor(event, data.palette);
        chip.style.backgroundColor = color; chip.style.color = colorText(color);
        chip.textContent = event.summary || "(Sem título)";
        button.appendChild(chip);
      }
      if (items.length > 2) {
        const more = document.createElement("small"); more.textContent = `+${items.length - 2}`;
        button.appendChild(more);
      }
      button.addEventListener("click", () => { selectedDay = key; renderCalendarView(data); });
      grid.appendChild(button);
    }
  }
  if (calendarView === "week") {
    const week = elt("google-week"); week.replaceChildren();
    for (let offset = 0; offset < 7; offset++) {
      const day = new Date(range.start); day.setDate(day.getDate() + offset);
      const key = localDateKey(day);
      const section = document.createElement("section"); section.className = "google-week-day";
      if (key === localDateKey(new Date())) section.classList.add("today");
      const heading = document.createElement("h4");
      heading.textContent = new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "numeric", month: "short" }).format(day);
      section.appendChild(heading);
      const cards = document.createElement("div"); cards.className = "google-events";
      renderAgenda(cards, byDay.get(key) || [], data.palette, key);
      section.appendChild(cards); week.appendChild(section);
    }
  } else {
    elt("google-day-title").textContent = `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
    renderAgenda(elt("google-events"), byDay.get(selectedDay) || [], data.palette, selectedDay);
  }
}

export function initGoogleCalendar(personGetter) {
  getPerson = personGetter;
  async function render() {
    const person = getPerson();
    const identity = ++requestId;
    const session = sessionFor(person);
    elt("google-owner").textContent = `Calendários de ${LABELS[person]}`;
    elt("google-account").textContent = session ? `Conta: ${session.email}` : "";
    elt("google-connect").hidden = !!session;
    elt("google-disconnect").hidden = !session;
    elt("google-refresh").hidden = !session;
    elt("google-change-account").hidden = !localStorage.getItem(bindingKey(person));
    elt("google-calendar").hidden = true; // nunca mostrar eventos da identidade anterior enquanto carrega
    currentData = null;
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes("COLOCA_AQUI")) {
      status("Falta configurar o Google OAuth Client ID em config.js."); return;
    }
    if (!session) { status("Liga a tua conta Google para consultar os eventos. A ligação poderá ter de ser repetida mais tarde."); return; }
    status("A carregar eventos…");
    try {
      const [calendars, palette] = await Promise.all([
        loadCalendars(session.token),
        googleFetch("https://www.googleapis.com/calendar/v3/colors", session.token).catch(() => ({ event: {}, calendar: {} })),
      ]);
      if (identity !== requestId || person !== getPerson()) return;
      const enriched = calendars.map(calendar => ({ ...calendar, color: calendarColor(calendar, palette) }));
      const range = calendarRange(calendarView, selectedDay);
      const results = await Promise.allSettled(enriched.map(calendar => loadCalendarEvents(calendar, session, identity, range)));
      if (identity !== requestId || person !== getPerson()) return;
      const errors = results.filter(result => result.status === "rejected");
      if (errors.length === enriched.length && errors.length) throw errors[0].reason;
      for (const calendar of enriched) {
        if (!visibleByPerson[person].has(calendar.id)) visibleByPerson[person].set(calendar.id, calendar.selected !== false);
      }
      const data = { calendars: enriched, palette, events: results.flatMap(result => result.status === "fulfilled" ? result.value : []) };
      currentData = data;
      renderCalendarChoices(data, person);
      renderCalendarView(data);
      elt("google-calendar").hidden = false;
      status(errors.length ? `Não foi possível carregar ${errors.length} calendário(s). Os restantes estão visíveis.` : "");
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
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, "openid", "email", EVENTS_SCOPE, CALENDAR_LIST_SCOPE)) {
          if (person === getPerson()) status("É preciso autorizar a lista de calendários, os eventos e o email da conta.");
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
  document.querySelectorAll("[data-google-view]").forEach(button => {
    button.addEventListener("click", () => {
      if (calendarView === button.dataset.googleView) return;
      calendarView = button.dataset.googleView;
      void render();
    });
  });
  elt("google-today").addEventListener("click", () => {
    selectedDay = localDateKey(new Date());
    void render();
  });
  for (const [id, delta] of [["google-prev", -1], ["google-next", 1]]) {
    elt(id).addEventListener("click", () => {
      selectedDay = shiftCalendarDate(calendarView, selectedDay, delta);
      void render();
    });
  }
  return { render };
}
