// Date-only values from Google are calendar dates, not UTC instants.
export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
