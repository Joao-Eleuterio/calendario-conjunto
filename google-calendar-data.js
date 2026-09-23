// Date-only values from Google are calendar dates, not UTC instants.
export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calendarRange(view, dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (view === "month") return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
  if (view === "week") {
    const start = new Date(date);
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return { start, end };
  }
  const end = new Date(date); end.setDate(end.getDate() + 1);
  return { start: date, end };
}

export function shiftCalendarDate(view, dayKey, direction) {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (view === "month") {
    const target = new Date(year, month - 1 + direction, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return localDateKey(new Date(target.getFullYear(), target.getMonth(), Math.min(day, lastDay)));
  }
  const target = new Date(year, month - 1, day);
  target.setDate(target.getDate() + direction * (view === "week" ? 7 : 1));
  return localDateKey(target);
}

export function eventDays(event, monthStart, monthEnd) {
  const start = event.start?.dateTime ? new Date(event.start.dateTime) : new Date(`${event.start?.date}T00:00:00`);
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(`${event.end?.date}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return [];
  const first = new Date(Math.max(start.getTime(), monthStart.getTime()));
  first.setHours(0, 0, 0, 0);
  const last = new Date(Math.min(end.getTime() - 1, monthEnd.getTime() - 1));
  last.setHours(0, 0, 0, 0);
  const days = [];
  for (let day = first; day <= last; day.setDate(day.getDate() + 1)) days.push(localDateKey(day));
  return days;
}

export function timeLabel(event) {
  if (!event.start?.dateTime) return "Dia inteiro";
  return new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.start.dateTime));
}

const FALLBACK_COLOR = "#1F6F64";
function safeColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

export function calendarColor(calendar, palette = {}) {
  return safeColor(calendar.backgroundColor) || safeColor(palette.calendar?.[calendar.colorId]?.background) || FALLBACK_COLOR;
}

export function eventColor(event, palette = {}) {
  return safeColor(palette.event?.[event.colorId]?.background) || safeColor(event.calendarColor) || FALLBACK_COLOR;
}

export function colorText(hex) {
  const color = safeColor(hex) || FALLBACK_COLOR;
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255);
  const brightness = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = .2126 * brightness[0] + .7152 * brightness[1] + .0722 * brightness[2];
  return luminance > .36 ? "#202124" : "#ffffff";
}
