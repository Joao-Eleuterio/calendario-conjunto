const MAX_GENERATED_OCCURRENCES = 1000;

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromISO(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(iso, amount) {
  const date = fromISO(iso);
  date.setDate(date.getDate() + amount);
  return toISO(date);
}

export function addMonths(iso, amount) {
  const date = fromISO(iso);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toISO(date);
}

export function addYears(iso, amount) {
  const date = fromISO(iso);
  const month = date.getMonth();
  date.setFullYear(date.getFullYear() + amount);
  if (date.getMonth() !== month) date.setDate(0);
  return toISO(date);
}

export function newSeriesId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function recurrenceDates(start, rule) {
  if (!rule || rule.type === "none") return [start];

  const requestedCount = Number(rule.count);
  const maxOccurrences = Number.isFinite(requestedCount) && requestedCount > 0
    ? Math.min(Math.floor(requestedCount), MAX_GENERATED_OCCURRENCES)
    : MAX_GENERATED_OCCURRENCES;
  const until = rule.until || addYears(start, 2);
  const dates = [];
  let current = start;
  let interval = 0;

  while (dates.length < maxOccurrences && current <= until) {
    const day = fromISO(current).getDay();
    if (rule.type !== "weekdays" || (day !== 0 && day !== 6)) dates.push(current);

    interval += 1;
    if (rule.type === "daily" || rule.type === "weekdays") current = addDays(current, 1);
    else if (rule.type === "weekly") current = addDays(start, interval * 7);
    else if (rule.type === "monthly") current = addMonths(start, interval);
    else if (rule.type === "yearly") current = addYears(start, interval);
    else break;
  }

  return dates;
}
