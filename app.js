import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PERSON_LABEL = { conjunto: "Conjunto", joao: "João", ines: "Inês" };
const WEEKDAYS_PT = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
const MONTHS_PT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

// ---------- utils de data (sempre em horário local, sem UTC drift) ----------
function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function fromISO(iso) {
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m-1, d);
}
function todayISO() { return toISO(new Date()); }
function addDays(iso, n) { const d = fromISO(iso); d.setDate(d.getDate()+n); return toISO(d); }
function addMonths(iso, n) { const d = fromISO(iso), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth()+1, 0).getDate())); return toISO(d); }
function addYears(iso, n) { const d = fromISO(iso), m = d.getMonth(); d.setFullYear(d.getFullYear()+n); if (d.getMonth() !== m) d.setDate(0); return toISO(d); }
function isPastOrToday(iso) { return iso <= todayISO(); }
function newSeriesId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function recurrenceDates(start, rule) {
  if (!rule || rule.type === "none") return [start];
  const out = [], max = Math.min(Number(rule.count) || 100, 500);
  let current = start;
  const until = rule.until || addYears(start, 2);
  while (out.length < max && current <= until) {
    if (rule.type !== "weekdays" || ![0,6].includes(fromISO(current).getDay())) out.push(current);
    if (rule.type === "daily" || rule.type === "weekdays") current = addDays(current, 1);
    else if (rule.type === "weekly") current = addDays(current, 7);
    else if (rule.type === "monthly") current = addMonths(current, 1);
    else if (rule.type === "yearly") current = addYears(current, 1);
    else break;
  }
  return out;
}

// ---------- identidade ----------
function getIdentity() { return localStorage.getItem("cc_identity"); }
function setIdentity(p) { localStorage.setItem("cc_identity", p); }
function otherPerson(p) { return p === "joao" ? "ines" : "joao"; }

// ---------- estado ----------
const state = {
  person: getIdentity(),
  activeTab: "dia",
  dayDate: todayISO(),
  monthCursor: (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })(),
  monthEvents: [],   // eventos do mês visível (para os pontinhos)
  monthMarks: [],    // day_marks do mês visível
};

// ================================================================
// BOOT
// ================================================================
function boot() {
  if (!state.person) {
    document.getElementById("identity-screen").hidden = false;
    document.querySelectorAll(".identity-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        setIdentity(btn.dataset.person);
        state.person = btn.dataset.person;
        document.getElementById("identity-screen").hidden = true;
        startApp();
      });
    });
  } else {
    startApp();
  }
}

function startApp() {
  document.getElementById("app").hidden = false;
  renderIdentityPill();
  wireIdentityPill();
  wireTabs();
  wireDayNav();
  wireMonthNav();
  wireP50AddRule();
  renderDay();
  renderMonth();
  renderP50();
  subscribeRealtime();
  registerSW();
}

function renderIdentityPill() {
  document.getElementById("identity-pill").textContent = `A ver como ${PERSON_LABEL[state.person]}`;
}
function wireIdentityPill() {
  document.getElementById("identity-pill").addEventListener("click", () => {
    const alt = otherPerson(state.person);
    if (confirm(`Trocar para ${PERSON_LABEL[alt]} neste aparelho?`)) {
      state.person = alt;
      setIdentity(alt);
      renderIdentityPill();
      renderDay(); renderMonth(); renderP50();
    }
  });
}

// ================================================================
// TABS
// ================================================================
function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("view-dia").hidden = tab !== "dia";
  document.getElementById("view-mes").hidden = tab !== "mes";
  document.getElementById("view-p50").hidden = tab !== "p50";
}

// ================================================================
// ABA DIA
// ================================================================
function wireDayNav() {
  document.getElementById("day-prev").addEventListener("click", () => { state.dayDate = addDays(state.dayDate, -1); renderDay(); });
  document.getElementById("day-next").addEventListener("click", () => { state.dayDate = addDays(state.dayDate, 1); renderDay(); });
  document.getElementById("day-today-btn").addEventListener("click", () => { state.dayDate = todayISO(); renderDay(); });
}

async function renderDay() {
  const d = fromISO(state.dayDate);
  document.getElementById("day-weekday").textContent = WEEKDAYS_PT[d.getDay()];
  document.getElementById("day-date").textContent = `${d.getDate()} de ${MONTHS_PT[d.getMonth()]}`;

  const { data: events, error } = await sb.from("events").select("*").eq("event_date", state.dayDate).order("event_time", { ascending: true, nullsFirst: false });
  if (error) { console.error(error); return; }

  const cols = document.getElementById("day-columns");
  cols.innerHTML = "";
  for (const owner of ["conjunto","joao","ines"]) {
    cols.appendChild(buildDaySection(owner, (events||[]).filter(e => e.owner === owner)));
  }
}

function buildDaySection(owner, items) {
  const section = document.createElement("div");
  section.className = `day-section ${owner}`;
  const head = document.createElement("div");
  head.className = "day-section-head";
  head.innerHTML = `<h3>${PERSON_LABEL[owner]}</h3>`;
  const addBtn = document.createElement("button");
  addBtn.className = "add-task-btn";
  addBtn.textContent = "+";
  addBtn.addEventListener("click", () => openTaskModal({ owner, date: state.dayDate }));
  head.appendChild(addBtn);
  section.appendChild(head);

  const list = document.createElement("ul");
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "task-empty";
    empty.textContent = "Sem nada por aqui.";
    list.appendChild(empty);
  }
  for (const ev of items) {
    const tpl = document.getElementById("tpl-checklist-item").content.cloneNode(true);
    const li = tpl.querySelector(".task");
    const checkbox = tpl.querySelector("input");
    checkbox.checked = ev.done;
    tpl.querySelector(".task-title").textContent = ev.title;
    tpl.querySelector(".task-meta").textContent = ev.event_time ? ev.event_time.slice(0,5) : "";
    checkbox.addEventListener("change", async () => {
      await sb.from("events").update({ done: checkbox.checked }).eq("id", ev.id);
    });
    tpl.querySelector(".task-delete").addEventListener("click", async () => {
      if (!ev.recurrence_id) {
        if (confirm("Apagar esta tarefa?")) await sb.from("events").delete().eq("id", ev.id);
        return;
      }
      openSeriesDeleteModal(ev);
    });
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

// ================================================================
// MODAL: nova tarefa / evento
// ================================================================
function openSeriesDeleteModal(ev) {
  const box = document.getElementById("modal-box");
  box.innerHTML = `
    <h3>Apagar evento recorrente</h3>
    <p class="modal-copy">Este item faz parte de uma série. O que queres apagar?</p>
    <div class="series-actions">
      <button class="series-choice" id="del-one"><strong>Só este evento</strong><span>Os restantes mantêm-se.</span></button>
      <button class="series-choice" id="del-following"><strong>Este e os seguintes</strong><span>Mantém apenas os anteriores.</span></button>
      <button class="series-choice danger" id="del-all"><strong>Todos os eventos</strong><span>Apaga toda a série.</span></button>
    </div>
    <button class="btn-secondary full-btn" id="del-cancel">Cancelar</button>`;
  openModal();
  box.querySelector("#del-cancel").addEventListener("click", closeModal);
  box.querySelector("#del-one").addEventListener("click", async () => { await sb.from("events").delete().eq("id", ev.id); closeModal(); });
  box.querySelector("#del-following").addEventListener("click", async () => { await sb.from("events").delete().eq("recurrence_id", ev.recurrence_id).gte("event_date", ev.event_date); closeModal(); });
  box.querySelector("#del-all").addEventListener("click", async () => { await sb.from("events").delete().eq("recurrence_id", ev.recurrence_id); closeModal(); });
}

function recurrenceLabel(type) {
  return ({ none:"Não se repete", daily:"Todos os dias", weekdays:"Dias úteis (2.ª a 6.ª)", weekly:"Todas as semanas", monthly:"Todos os meses", yearly:"Todos os anos" })[type] || "Não se repete";
}
function openTaskModal({ owner, date }) {
  const box = document.getElementById("modal-box");
  box.innerHTML = `
    <h3>Novo item</h3>
    <div class="field"><label>Título</label><input id="f-title" type="text" placeholder="Ex: Marcar médico" /></div>
    <div class="field"><label>Data</label><input id="f-date" type="date" value="${date}" /></div>
    <div class="field"><label>Hora (opcional)</label><input id="f-time" type="time" /></div>
    <div class="field"><label>Repetir</label>
      <select id="f-repeat">
        <option value="none">Não se repete</option>
        <option value="daily">Todos os dias</option>
        <option value="weekdays">Dias úteis (2.ª a 6.ª)</option>
        <option value="weekly">Todas as semanas</option>
        <option value="monthly">Todos os meses</option>
        <option value="yearly">Todos os anos</option>
      </select>
    </div>
    <div id="f-repeat-end" class="repeat-end" hidden>
      <div class="field"><label>Termina</label>
        <select id="f-end-mode">
          <option value="never">Nunca (até 2 anos)</option>
          <option value="date">Numa data</option>
          <option value="count">Após um número de ocorrências</option>
        </select>
      </div>
      <div class="field" id="f-until-wrap" hidden><label>Data final</label><input id="f-until" type="date" /></div>
      <div class="field" id="f-count-wrap" hidden><label>N.º de ocorrências</label><input id="f-count" type="number" min="1" max="500" value="10" /></div>
    </div>
    <div class="field"><label>Para quem</label>
      <div class="owner-pick" id="f-owner">
        <button data-owner="conjunto" class="conjunto">Conjunto</button>
        <button data-owner="joao" class="joao">João</button>
        <button data-owner="ines" class="ines">Inês</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="f-cancel">Cancelar</button>
      <button class="btn-primary" id="f-save">Guardar</button>
    </div>
  `;
  let chosenOwner = owner || "conjunto";
  const ownerBtns = box.querySelectorAll("#f-owner button");
  const paintOwner = () => ownerBtns.forEach(b => b.classList.toggle("sel", b.dataset.owner === chosenOwner) && b.classList.add(b.dataset.owner) );
  ownerBtns.forEach(b => {
    b.classList.add(b.dataset.owner);
    b.addEventListener("click", () => { chosenOwner = b.dataset.owner; paintOwner(); });
  });
  paintOwner();

  const repeat = box.querySelector("#f-repeat"), repeatEnd = box.querySelector("#f-repeat-end");
  const endMode = box.querySelector("#f-end-mode"), untilWrap = box.querySelector("#f-until-wrap"), countWrap = box.querySelector("#f-count-wrap");
  const syncRepeat = () => { repeatEnd.hidden = repeat.value === "none"; };
  const syncEnd = () => { untilWrap.hidden = endMode.value !== "date"; countWrap.hidden = endMode.value !== "count"; };
  repeat.addEventListener("change", syncRepeat); endMode.addEventListener("change", syncEnd);
  syncRepeat(); syncEnd();

  openModal();
  box.querySelector("#f-cancel").addEventListener("click", closeModal);
  box.querySelector("#f-save").addEventListener("click", async () => {
    const title = box.querySelector("#f-title").value.trim();
    if (!title) { box.querySelector("#f-title").focus(); return; }
    const payload = {
      title,
      event_date: box.querySelector("#f-date").value || date,
      event_time: box.querySelector("#f-time").value || null,
      owner: chosenOwner,
      created_by: state.person,
      done: false,
    };
    const repeatType = box.querySelector("#f-repeat").value;
    if (repeatType === "none") {
      const { error } = await sb.from("events").insert(payload);
      if (error) { alert("Não foi possível guardar: " + error.message); return; }
    } else {
      const endMode = box.querySelector("#f-end-mode").value;
      const rule = { type: repeatType };
      if (endMode === "date") {
        rule.until = box.querySelector("#f-until").value;
        if (!rule.until || rule.until < payload.event_date) { alert("Escolhe uma data final igual ou posterior à data inicial."); return; }
        rule.count = 500;
      } else if (endMode === "count") {
        rule.count = Math.max(1, Math.min(500, Number(box.querySelector("#f-count").value) || 1));
      } else {
        rule.until = addYears(payload.event_date, 2);
        rule.count = 500;
      }
      const seriesId = newSeriesId();
      const rows = recurrenceDates(payload.event_date, rule).map(event_date => ({ ...payload, event_date, recurrence_id: seriesId, recurrence_rule: rule }));
      const { error } = await sb.from("events").insert(rows);
      if (error) { alert("Não foi possível guardar a recorrência: " + error.message); return; }
    }
    closeModal();
  });
}

function openModal() { document.getElementById("modal-backdrop").hidden = false; }
function closeModal() { document.getElementById("modal-backdrop").hidden = true; document.getElementById("modal-box").innerHTML = ""; }
document.getElementById("modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "modal-backdrop") closeModal(); });

// ================================================================
// ABA MÊS
// ================================================================
function wireMonthNav() {
  document.getElementById("month-prev").addEventListener("click", () => { shiftMonth(-1); });
  document.getElementById("month-next").addEventListener("click", () => { shiftMonth(1); });
}
function shiftMonth(delta) {
  let { y, m } = state.monthCursor;
  m += delta;
  if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
  state.monthCursor = { y, m };
  renderMonth();
}

async function renderMonth() {
  const { y, m } = state.monthCursor;
  document.getElementById("month-title").textContent = `${MONTHS_PT[m]} de ${y}`;

  const first = new Date(y, m, 1);
  const last = new Date(y, m+1, 0);
  const fromDate = toISO(first), toDate = toISO(last);

  const [{ data: events }, { data: marks }] = await Promise.all([
    sb.from("events").select("event_date, owner").gte("event_date", fromDate).lte("event_date", toDate),
    sb.from("day_marks").select("event_date, person").gte("event_date", fromDate).lte("event_date", toDate),
  ]);
  state.monthEvents = events || [];
  state.monthMarks = marks || [];

  const grid = document.getElementById("month-grid");
  grid.innerHTML = "";

  // segunda-feira como primeiro dia da semana
  const startOffset = (first.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + last.getDate()) / 7) * 7;
  const gridStart = new Date(first); gridStart.setDate(gridStart.getDate() - startOffset);

  for (let i = 0; i < totalCells; i++) {
    const cellDate = new Date(gridStart); cellDate.setDate(gridStart.getDate() + i);
    const iso = toISO(cellDate);
    grid.appendChild(buildDayCell(iso, cellDate.getMonth() === m));
  }
}

function buildDayCell(iso, inMonth) {
  const cell = document.createElement("div");
  cell.className = "day-cell" + (inMonth ? "" : " outside") + (iso === todayISO() ? " today" : "");

  const marksForDay = state.monthMarks.filter(x => x.event_date === iso);
  const confirmed = marksForDay.some(x => x.person === "joao") && marksForDay.some(x => x.person === "ines");
  if (confirmed) cell.classList.add("confirmed");

  const num = document.createElement("span");
  num.className = "num";
  num.textContent = fromISO(iso).getDate();
  cell.appendChild(num);

  const owners = new Set(state.monthEvents.filter(e => e.event_date === iso).map(e => e.owner));
  if (owners.size) {
    const dots = document.createElement("div");
    dots.className = "day-dots";
    owners.forEach(o => { const s = document.createElement("span"); s.className = `dot-${o}`; dots.appendChild(s); });
    cell.appendChild(dots);
  }

  if (isPastOrToday(iso)) {
    const mineMarked = marksForDay.some(x => x.person === state.person);
    const markBtn = document.createElement("button");
    markBtn.className = "mark-btn" + (mineMarked ? " mine" : "");
    markBtn.title = mineMarked ? "Já marcaste este dia — toca para desmarcar" : "Marcar este dia como feito";
    markBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (mineMarked) {
        await sb.from("day_marks").delete().eq("event_date", iso).eq("person", state.person);
      } else {
        await sb.from("day_marks").insert({ event_date: iso, person: state.person });
      }
    });
    cell.appendChild(markBtn);
  }

  if (confirmed) {
    const x = document.createElement("div");
    x.className = "day-x";
    x.textContent = "✕";
    cell.appendChild(x);
  }

  cell.addEventListener("click", () => { state.dayDate = iso; switchTab("dia"); renderDay(); });
  return cell;
}

// ================================================================
// ABA PROJECT 50
// ================================================================
function wireP50AddRule() {
  document.getElementById("p50-add-rule").addEventListener("click", async () => {
    const text = prompt("Nova regra:");
    if (!text || !text.trim()) return;
    const { data: existing } = await sb.from("project50_rules").select("position").order("position", { ascending: false }).limit(1);
    const nextPos = existing && existing.length ? existing[0].position + 1 : 1;
    await sb.from("project50_rules").insert({ text: text.trim(), position: nextPos });
  });
}

async function renderP50() {
  const today = todayISO();
  const [{ data: rules }, { data: checkins }] = await Promise.all([
    sb.from("project50_rules").select("*").eq("active", true).order("position", { ascending: true }),
    sb.from("project50_checkins").select("rule_id").eq("person", state.person).eq("checkin_date", today),
  ]);
  const doneToday = new Set((checkins||[]).map(c => c.rule_id));

  const list = document.getElementById("p50-rules");
  list.innerHTML = "";
  (rules||[]).forEach((rule, idx) => list.appendChild(buildRuleRow(rule, idx+1, doneToday.has(rule.id))));

  renderP50Folders();
}

function buildRuleRow(rule, num, checked) {
  const li = document.createElement("li");
  li.className = "p50-rule";
  li.innerHTML = `
    <span class="p50-rule-num">${num}.</span>
    <input type="checkbox" ${checked ? "checked" : ""} />
    <span class="p50-rule-text">${escapeHtml(rule.text)}</span>
    <div class="p50-rule-actions">
      <button class="edit" title="Editar">✎</button>
      <button class="del" title="Remover">✕</button>
    </div>
  `;
  const checkbox = li.querySelector("input");
  checkbox.addEventListener("change", async () => {
    const today = todayISO();
    if (checkbox.checked) {
      await sb.from("project50_checkins").upsert({ rule_id: rule.id, person: state.person, checkin_date: today, done: true });
    } else {
      await sb.from("project50_checkins").delete().eq("rule_id", rule.id).eq("person", state.person).eq("checkin_date", today);
    }
  });
  li.querySelector(".del").addEventListener("click", async () => {
    if (confirm("Remover esta regra?")) await sb.from("project50_rules").update({ active: false }).eq("id", rule.id);
  });
  li.querySelector(".edit").addEventListener("click", () => {
    const textSpan = li.querySelector(".p50-rule-text");
    const input = document.createElement("input");
    input.className = "edit-input";
    input.value = rule.text;
    textSpan.replaceWith(input);
    input.focus();
    const save = async () => {
      const val = input.value.trim();
      if (val && val !== rule.text) await sb.from("project50_rules").update({ text: val }).eq("id", rule.id);
      else renderP50();
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  });
  return li;
}

function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

// ---------- pastas de fotos ----------
const FOLDERS = ["Manha","Fitness","Ler","Skill"];
const FOLDER_LABEL = { Manha: "Manhã", Fitness: "Fitness", Ler: "Ler", Skill: "Skill" };

async function renderP50Folders() {
  const container = document.getElementById("p50-folders");
  container.innerHTML = "";
  const { data: photos } = await sb.from("project50_photos").select("*").order("created_at", { ascending: false });

  for (const cat of FOLDERS) {
    const folder = document.createElement("div");
    folder.className = "p50-folder";
    const head = document.createElement("div");
    head.className = "p50-folder-head";
    head.innerHTML = `<h3>${FOLDER_LABEL[cat]}</h3>`;
    const uploadBtn = document.createElement("button");
    uploadBtn.className = "p50-upload-btn";
    uploadBtn.textContent = "+ foto";
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.capture = "environment"; input.hidden = true;
    input.addEventListener("change", () => uploadPhoto(cat, input.files[0]));
    uploadBtn.addEventListener("click", () => input.click());
    head.appendChild(uploadBtn);
    head.appendChild(input);
    folder.appendChild(head);

    const items = (photos||[]).filter(p => p.category === cat);
    const grid = document.createElement("div");
    grid.className = "p50-photo-grid";
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "p50-photo-empty";
      empty.textContent = "Ainda sem fotos.";
      folder.appendChild(empty);
    } else {
      for (const p of items) {
        const { data: pub } = sb.storage.from("project50-photos").getPublicUrl(p.storage_path);
        const cell = document.createElement("div");
        cell.className = "p50-photo";
        const dt = new Date(p.created_at);
        const cap = `${PERSON_LABEL[p.person]} · ${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")} ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
        cell.innerHTML = `<img src="${pub.publicUrl}" alt="${FOLDER_LABEL[cat]}" loading="lazy" /><div class="cap">${cap}</div>`;
        grid.appendChild(cell);
      }
      folder.appendChild(grid);
    }
    container.appendChild(folder);
  }
}

async function uploadPhoto(category, file) {
  if (!file) return;
  const stamp = Date.now();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${category}/${state.person}-${stamp}.${ext}`;
  const { error: upErr } = await sb.storage.from("project50-photos").upload(path, file, { upsert: false });
  if (upErr) { alert("Não foi possível enviar a foto: " + upErr.message); return; }
  const { error: dbErr } = await sb.from("project50_photos").insert({ category, person: state.person, storage_path: path });
  if (dbErr) { alert("Foto enviada mas não foi possível registar: " + dbErr.message); }
}

// ================================================================
// REALTIME — para veres logo o que o outro adicionou
// ================================================================
function subscribeRealtime() {
  sb.channel("cc-events").on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
    if (state.activeTab === "dia") renderDay();
    if (state.activeTab === "mes") renderMonth();
  }).subscribe();

  sb.channel("cc-marks").on("postgres_changes", { event: "*", schema: "public", table: "day_marks" }, () => {
    if (state.activeTab === "mes") renderMonth();
  }).subscribe();

  sb.channel("cc-rules").on("postgres_changes", { event: "*", schema: "public", table: "project50_rules" }, () => {
    if (state.activeTab === "p50") renderP50();
  }).subscribe();

  sb.channel("cc-checkins").on("postgres_changes", { event: "*", schema: "public", table: "project50_checkins" }, () => {
    if (state.activeTab === "p50") renderP50();
  }).subscribe();

  sb.channel("cc-photos").on("postgres_changes", { event: "*", schema: "public", table: "project50_photos" }, () => {
    if (state.activeTab === "p50") renderP50Folders();
  }).subscribe();

  // além do realtime, atualiza sempre que a app volta a ficar visível
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { renderDay(); renderMonth(); renderP50(); }
  });
}

// ================================================================
// PWA
// ================================================================
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

boot();
