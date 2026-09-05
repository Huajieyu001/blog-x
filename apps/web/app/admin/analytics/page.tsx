import { cookies } from "next/headers";
import type { AdminAnalytics } from "@blog-x/contracts";
import { getAdminAnalytics } from "../../lib/api";
import { AnalyticsDetails, AnalyticsDisclosure, AnalyticsFailure, AnalyticsRangeNav, DailyTrend } from "../_components/AdminAnalytics";
import styles from "../admin.module.css";

type SearchParameters = Record<string, string | string[] | undefined>;

function resolveRange(searchParams: SearchParameters): AdminAnalytics["range"] | null {
  const entries = Object.entries(searchParams);
  if (entries.length === 0) return 30;
  if (entries.length !== 1 || entries[0]?.[0] !== "range") return null;
  const value = entries[0][1];
  if (typeof value !== "string") return null;
  return value === "7" ? 7 : value === "30" ? 30 : value === "90" ? 90 : value === "400" ? 400 : null;
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const range = resolveRange(await searchParams);
  if (!range) return <main className={styles.analyticsPage}>
    <header className={styles.analyticsHeader}><div><p className={styles.eyebrow}>BLOG X / 管理</p><h1>时间范围无效</h1></div><a href="/admin">返回工作台</a></header>
    <section className={styles.errorPanel} role="alert"><p>请选择 7、30、90 或 400 天。</p><p><a href="/admin/analytics?range=30">查看 30 天</a><span aria-hidden="true"> · </span><a href="/admin">返回工作台</a></p></section>
  </main>;
  const result = await getAdminAnalytics((await cookies()).toString(), range, 8);
  return <main className={styles.analyticsPage}>
    <header className={styles.analyticsHeader}><div><p className={styles.eyebrow}>BLOG X / 管理</p><h1>访问统计</h1><p>了解文章被打开的趋势，不追踪具体访客。</p></div><a href="/admin">返回工作台</a></header>
    <AnalyticsDisclosure />
    <AnalyticsRangeNav range={range} />
    {result.kind === "upstream_error" ? <AnalyticsFailure range={range} /> : <>
      <p className={styles.rangeCaption}>{result.data.fromDay} 至 {result.data.toDay} · 共 {result.data.range} 天</p>
      <DailyTrend analytics={result.data} />
      <AnalyticsDetails analytics={result.data} />
    </>}
  </main>;
}

export { resolveRange };
