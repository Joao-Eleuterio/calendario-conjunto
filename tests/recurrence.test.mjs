import test from "node:test";
import assert from "node:assert/strict";

import { addMonths, addYears, recurrenceDates } from "../recurrence.js";

test("monthly recurrence clamps to the final day of shorter months", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.deepEqual(
    recurrenceDates("2026-01-31", { type: "monthly", count: 3 }),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
  );
});

test("yearly recurrence keeps leap day on the final valid February day", () => {
  assert.equal(addYears("2024-02-29", 1), "2025-02-28");
});

test("weekday recurrence skips Saturdays and Sundays", () => {
  assert.deepEqual(
    recurrenceDates("2026-09-18", { type: "weekdays", count: 4 }),
    ["2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23"],
  );
});

test("an end date is inclusive", () => {
  assert.deepEqual(
    recurrenceDates("2026-09-21", { type: "daily", until: "2026-09-23" }),
    ["2026-09-21", "2026-09-22", "2026-09-23"],
  );
});

test("the two-year default is not truncated at 500 daily occurrences", () => {
  const dates = recurrenceDates("2026-09-21", { type: "daily" });
  assert.ok(dates.length > 500);
  assert.equal(dates.at(-1), "2028-09-21");
});

test("non-recurring events return only their start date", () => {
  assert.deepEqual(recurrenceDates("2026-09-21", { type: "none" }), ["2026-09-21"]);
});
