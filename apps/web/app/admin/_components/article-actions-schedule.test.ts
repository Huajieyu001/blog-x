import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTimezoneOffset,
  localDateTimeAtOffset,
  scheduleFormStateAtOffset,
} from "./article-actions-schedule";

test("formats numeric UTC offsets without consulting the executing machine timezone", () => {
  assert.equal(formatTimezoneOffset(480), "+08:00");
  assert.equal(formatTimezoneOffset(-300), "-05:00");
  assert.equal(formatTimezoneOffset(345), "+05:45");
  assert.equal(formatTimezoneOffset(-30), "-00:30");
});

test("rejects offset values outside the accepted numeric range", () => {
  assert.equal(formatTimezoneOffset(-840), "-14:00");
  assert.equal(formatTimezoneOffset(840), "+14:00");
  assert.throws(() => formatTimezoneOffset(-841), /between -840 and 840/i);
  assert.throws(() => formatTimezoneOffset(841), /between -840 and 840/i);
  assert.throws(() => formatTimezoneOffset(0.5), /whole number/i);
});

test("converts durable instants to the matching local datetime at an explicit positive or negative offset", () => {
  const instant = "2026-12-01T02:15:00.000Z";
  assert.equal(localDateTimeAtOffset(instant, 480), "2026-12-01T10:15");
  assert.equal(localDateTimeAtOffset(instant, -300), "2026-11-30T21:15");
  assert.equal(localDateTimeAtOffset(instant, 345), "2026-12-01T08:00");
});

test("keeps a selected offset when no durable schedule exists", () => {
  assert.deepEqual(scheduleFormStateAtOffset(null, -300), {
    scheduledAt: "",
    timezoneOffset: "-05:00",
  });
});
