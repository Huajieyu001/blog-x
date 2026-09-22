import assert from "node:assert/strict";
import test from "node:test";
import { adminAnalyticsQuerySchema, adminAnalyticsResponseSchema } from "./analytics.js";

function analytics(range: 7 | 30 | 90 | 400 = 7) {
  const start = new Date(Date.UTC(2026, 8, 1));
  const dayBefore = (day: Date, amount: number) => {
    const value = new Date(day);
    value.setUTCDate(value.getUTCDate() - amount);
    return value.toISOString().slice(0, 10);
  };
  const daily = Array.from({ length: range }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    return { day: day.toISOString().slice(0, 10), pv: index === range - 1 ? 5 : 0 };
  });
  return {
    range,
    timezone: "Asia/Shanghai" as const,
    fromDay: daily[0]?.day,
    toDay: daily.at(-1)?.day,
    totalPv: 5,
    daily,
    sources: [
      { source: "direct", totalPv: 5 },
      { source: "internal", totalPv: 0 },
      { source: "search", totalPv: 0 },
      { source: "social", totalPv: 0 },
      { source: "external", totalPv: 0 },
    ],
    topArticles: [{ articleId: "00000000-0000-4000-8000-000000000001", title: "A", status: "published" as const, totalPv: 5 }],
    comparison: range === 400
      ? { status: "unavailable" as const, reason: "outside_retention" as const, previousFromDay: dayBefore(start, range), previousToDay: dayBefore(start, 1) }
      : { status: "available" as const, previousFromDay: dayBefore(start, range), previousToDay: dayBefore(start, 1), previousTotalPv: 3, deltaPv: 2 },
  };
}

test("analytics query only accepts exact scalar supported range and top limits", () => {
  for (const range of ["7", "30", "90", "400"]) {
    assert.deepEqual(adminAnalyticsQuerySchema.parse({ range, limit: "8" }), { range: Number(range), limit: 8 });
  }
  for (const input of [
    {}, { range: "30" }, { limit: "8" }, { range: "030", limit: "8" }, { range: "30", limit: "08" },
    { range: "30", limit: "1.0" }, { range: "30", limit: "+1" }, { range: "30", limit: " 1" },
    { range: ["30", "7"], limit: "1" }, { range: "30", limit: ["1", "2"] }, { range: "30", limit: "1", extra: "x" },
  ]) assert.equal(adminAnalyticsQuerySchema.safeParse(input).success, false);
});

test("analytics response requires exact Shanghai calendar continuity, arithmetic, sources, and top ordering", () => {
  const valid = analytics();
  assert.equal(adminAnalyticsResponseSchema.safeParse(valid).success, true);
  assert.equal(adminAnalyticsResponseSchema.safeParse({ ...valid, comparison: { ...valid.comparison, previousTotalPv: 7, deltaPv: -2 } }).success, true);
  assert.equal(adminAnalyticsResponseSchema.safeParse({ ...valid, comparison: { ...valid.comparison, previousTotalPv: 5, deltaPv: 0 } }).success, true);
  const outsideRetention = analytics(400);
  const invalid = [
    { ...valid, daily: valid.daily.slice(1) },
    { ...valid, daily: [{ ...valid.daily[0]!, day: "2026-09-02" }, ...valid.daily.slice(1)] },
    { ...valid, fromDay: "2026-08-31" },
    { ...valid, totalPv: 4 },
    { ...valid, comparison: undefined },
    { ...valid, comparison: { ...valid.comparison, previousToDay: "2026-08-30" } },
    { ...valid, comparison: { ...valid.comparison, previousTotalPv: 3, deltaPv: 1 } },
    { ...valid, comparison: { ...valid.comparison, extra: true } },
    { ...outsideRetention, comparison: { status: "available", previousFromDay: outsideRetention.comparison.previousFromDay, previousToDay: outsideRetention.comparison.previousToDay, previousTotalPv: 0, deltaPv: 5 } },
    { ...valid, comparison: { status: "unavailable", reason: "outside_retention", previousFromDay: "2026-08-25", previousToDay: "2026-08-31" } },
    { ...valid, comparison: { ...valid.comparison, deltaPv: Number.MAX_SAFE_INTEGER + 1 } },
    { ...valid, sources: valid.sources.slice(1) },
    { ...valid, sources: [...valid.sources.slice(0, 4), { source: "external", totalPv: 1 }] },
    { ...valid, topArticles: [{ ...valid.topArticles[0]!, totalPv: 0 }] },
    { ...valid, topArticles: [
      { articleId: "00000000-0000-4000-8000-000000000002", title: "B", status: "published", totalPv: 2 },
      { articleId: "00000000-0000-4000-8000-000000000001", title: "A", status: "published", totalPv: 3 },
    ] },
    { ...valid, topArticles: Array.from({ length: 9 }, (_, index) => ({ articleId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, title: `A${index}`, status: "published", totalPv: 1 })) },
    { ...valid, daily: valid.daily.map((point, index) => index === 0 ? { ...point, pv: Number.MAX_SAFE_INTEGER + 1 } : point) },
    { ...valid, hidden: true },
  ];
  for (const value of invalid) assert.equal(adminAnalyticsResponseSchema.safeParse(value).success, false);
});
