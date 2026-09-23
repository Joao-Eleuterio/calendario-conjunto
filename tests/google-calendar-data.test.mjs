import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarColor, eventColor, eventDays, timeLabel } from '../google-calendar-data.js';

const monthStart = new Date(2026, 8, 1);
const monthEnd = new Date(2026, 9, 1);

test('all-day event ends on exclusive end date', () => {
  assert.deepEqual(eventDays({ start: { date: '2026-09-02' }, end: { date: '2026-09-04' } }, monthStart, monthEnd), ['2026-09-02', '2026-09-03']);
});

test('event crossing month boundary appears on overlapping days only', () => {
  assert.deepEqual(eventDays({ start: { date: '2026-08-31' }, end: { date: '2026-09-03' } }, monthStart, monthEnd), ['2026-09-01', '2026-09-02']);
  assert.deepEqual(eventDays({ start: { date: '2026-10-01' }, end: { date: '2026-10-02' } }, monthStart, monthEnd), []);
});

test('timed events spanning midnight appear on both days', () => {
  assert.deepEqual(eventDays({ start: { dateTime: new Date(2026, 8, 7, 23, 30).toISOString() }, end: { dateTime: new Date(2026, 8, 8, 1).toISOString() } }, monthStart, monthEnd), ['2026-09-07', '2026-09-08']);
  assert.equal(timeLabel({ start: { date: '2026-09-07' } }), 'Dia inteiro');
});

test('calendar color and event override follow Google palette', () => {
  const palette = { calendar: { '2': { background: '#336699' } }, event: { '5': { background: '#FF9900' } } };
  assert.equal(calendarColor({ backgroundColor: '#123ABC', colorId: '2' }, palette), '#123ABC');
  assert.equal(calendarColor({ colorId: '2' }, palette), '#336699');
  assert.equal(eventColor({ calendarColor: '#123ABC', colorId: '5' }, palette), '#FF9900');
  assert.equal(eventColor({ calendarColor: '#123ABC' }, palette), '#123ABC');
  assert.equal(eventColor({ calendarColor: 'red' }, palette), '#1F6F64');
});
