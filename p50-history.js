import { sb as sbHistory } from "./supabase-client.js";
const PERSON_LABEL = { joao: "João", ines: "Inês" };
const HISTORY_DAYS_COLLAPSED = 14;
const HISTORY_DAYS_EXPANDED = 50;

const historyState = {
  selectedDate: todayISO(),
  expanded: false,
  rules: [],
  checkins: [],
};

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayISO() {
  return toISO(new Date());
}

function fromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, delta) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

function formatShortDate(iso) {
  return fromISO(iso).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatLongDate(iso) {
  if (iso === todayISO()) return "Hoje";
  return fromISO(iso).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function currentPerson() {
  const value = localStorage.getItem("cc_identity");
  return value === "joao" || value === "ines" ? value : null;
}

function getHistoryRoot() {
  return document.getElementById("p50-history");
}

function checkinsForDate(iso) {
  return historyState.checkins.filter((c) => c.checkin_date === iso && c.done !== false);
}

function doneMapForDate(iso) {
  return new Map(checkinsForDate(iso).map((c) => [c.rule_id, c]));
}

async function loadHistory() {
  const root = getHistoryRoot();
  const person = currentPerson();
  if (!root) return;

  if (!person) {
    root.hidden = true;
    return;
  }

  root.hidden = false;
  root.style.setProperty("--p50-history-accent", person === "joao" ? "var(--joao)" : "var(--ines)");

  const firstDate = addDays(todayISO(), -(HISTORY_DAYS_EXPANDED - 1));
  const [rulesResult, checkinsResult] = await Promise.all([
    sbHistory
      .from("project50_rules")
      .select("id,text,position,active")
      .eq("active", true)
      .order("position", { ascending: true }),
    sbHistory
      .from("project50_checkins")
      .select("rule_id,checkin_date,done,updated_at")
      .eq("person", person)
      .gte("checkin_date", firstDate)
      .lte("checkin_date", todayISO())
      .order("checkin_date", { ascending: false }),
  ]);

  if (rulesResult.error || checkinsResult.error) {
    const message = rulesResult.error?.message || checkinsResult.error?.message || "Erro desconhecido";
    root.innerHTML = `<div class="p50-history-error">Não foi possível carregar o histórico: ${escapeHtml(message)}</div>`;
    return;
  }

  historyState.rules = rulesResult.data || [];
  historyState.checkins = checkinsResult.data || [];

  if (historyState.selectedDate > todayISO()) historyState.selectedDate = todayISO();
  renderHistory();
}

function renderHistory() {
  const root = getHistoryRoot();
  const person = currentPerson();
  if (!root || !person) return;

  root.innerHTML = "";

  const header = document.createElement("div");
  header.className = "p50-history-head";

  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = `Histórico — ${PERSON_LABEL[person]}`;
  const subtitle = document.createElement("p");
  subtitle.textContent = "Cada regra fica guardada assim que a marcas. Toca num dia para veres o detalhe.";
  titleWrap.append(title, subtitle);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "p50-history-toggle";
  toggle.textContent = historyState.expanded ? "Ver 14 dias" : "Ver 50 dias";
  toggle.addEventListener("click", () => {
    historyState.expanded = !historyState.expanded;
    renderHistory();
  });

  header.append(titleWrap, toggle);
  root.appendChild(header);

  const daysToShow = historyState.expanded ? HISTORY_DAYS_EXPANDED : HISTORY_DAYS_COLLAPSED;
  const grid = document.createElement("div");
  grid.className = "p50-history-grid";

  for (let offset = 0; offset < daysToShow; offset++) {
    const iso = addDays(todayISO(), -offset);
    const done = doneMapForDate(iso);
    const total = historyState.rules.length;
    const doneCount = historyState.rules.reduce((count, rule) => count + (done.has(rule.id) ? 1 : 0), 0);

    const day = document.createElement("button");
    day.type = "button";
    day.className = "p50-history-day";
    if (iso === todayISO()) day.classList.add("today");
    if (iso === historyState.selectedDate) day.classList.add("selected");
    if (total > 0 && doneCount === total) day.classList.add("complete");
    day.setAttribute("aria-label", `${formatLongDate(iso)}: ${doneCount} de ${total} regras concluídas`);

    const dateLabel = document.createElement("span");
    dateLabel.className = "p50-history-date";
    dateLabel.textContent = formatShortDate(iso).replace(".", "");

    const count = document.createElement("strong");
    count.className = "p50-history-count";
    count.textContent = `${doneCount}/${total}`;

    const bar = document.createElement("span");
    bar.className = "p50-history-bar";
    const fill = document.createElement("span");
    fill.style.width = total ? `${Math.round((doneCount / total) * 100)}%` : "0%";
    bar.appendChild(fill);

    day.append(dateLabel, count, bar);
    day.addEventListener("click", () => {
      historyState.selectedDate = iso;
      if (offset >= HISTORY_DAYS_COLLAPSED) historyState.expanded = true;
      renderHistory();
    });
    grid.appendChild(day);
  }

  root.appendChild(grid);
  root.appendChild(buildDayDetail(historyState.selectedDate));
}

function buildDayDetail(iso) {
  const detail = document.createElement("div");
  detail.className = "p50-history-detail";

  const done = doneMapForDate(iso);
  const doneCount = historyState.rules.reduce((count, rule) => count + (done.has(rule.id) ? 1 : 0), 0);

  const head = document.createElement("div");
  head.className = "p50-history-detail-head";

  const date = document.createElement("div");
  const dateTitle = document.createElement("h4");
  dateTitle.textContent = formatLongDate(iso);
  const dateSub = document.createElement("p");
  dateSub.textContent = `${doneCount} de ${historyState.rules.length} concluídas`;
  date.append(dateTitle, dateSub);

  const percent = document.createElement("strong");
  percent.className = "p50-history-percent";
  percent.textContent = historyState.rules.length
    ? `${Math.round((doneCount / historyState.rules.length) * 100)}%`
    : "0%";

  head.append(date, percent);
  detail.appendChild(head);

  const list = document.createElement("ul");
  list.className = "p50-history-list";

  if (!historyState.rules.length) {
    const empty = document.createElement("li");
    empty.className = "p50-history-empty";
    empty.textContent = "Ainda não existem regras ativas.";
    list.appendChild(empty);
  } else {
    historyState.rules.forEach((rule) => {
      const checkin = done.get(rule.id);
      const item = document.createElement("li");
      item.className = "p50-history-item" + (checkin ? " done" : "");

      const icon = document.createElement("span");
      icon.className = "p50-history-status";
      icon.textContent = checkin ? "✓" : "—";

      const text = document.createElement("span");
      text.className = "p50-history-rule-text";
      text.textContent = rule.text;

      const time = document.createElement("span");
      time.className = "p50-history-time";
      time.textContent = checkin ? formatTime(checkin.updated_at) : "";

      item.append(icon, text, time);
      list.appendChild(item);
    });
  }

  detail.appendChild(list);
  return detail;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function scheduleReload(resetSelected = false) {
  window.setTimeout(() => {
    if (resetSelected) historyState.selectedDate = todayISO();
    loadHistory();
  }, 0);
}

function wireHistoryRefreshes() {
  document.querySelectorAll(".identity-btn").forEach((button) => {
    button.addEventListener("click", () => scheduleReload(true));
  });

  document.getElementById("identity-pill")?.addEventListener("click", () => scheduleReload(true));

  document.getElementById("p50-rules")?.addEventListener("change", () => {
    window.setTimeout(loadHistory, 250);
  });

  sbHistory
    .channel("cc-p50-history")
    .on("postgres_changes", { event: "*", schema: "public", table: "project50_checkins" }, loadHistory)
    .on("postgres_changes", { event: "*", schema: "public", table: "project50_rules" }, loadHistory)
    .subscribe();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadHistory();
  });
}

wireHistoryRefreshes();
loadHistory();
