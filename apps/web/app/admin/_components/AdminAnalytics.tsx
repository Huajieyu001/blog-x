import type { AdminAnalytics } from "@blog-x/contracts";
import styles from "../admin.module.css";

const sourceLabels = {
  direct: ["直接访问", "无来源或无法可靠解析"],
  internal: ["站内跳转", "从 Blog X 其他页面进入"],
  search: ["搜索引擎", "从已识别的搜索站点进入"],
  social: ["社交平台", "从已识别的社交站点进入"],
  external: ["其他外部来源", "其他可解析的外部站点进入"],
} as const;

function pv(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function percent(value: number, total: number) {
  return total === 0 ? "0.0" : ((value / total) * 100).toFixed(1);
}

export function AnalyticsDisclosure() {
  return <aside className={styles.analyticsDisclosure} aria-labelledby="analytics-privacy-title">
    <h2 id="analytics-privacy-title">隐私说明</h2>
    <p>这里展示的是按 Asia/Shanghai 自然日汇总的匿名页面浏览量（PV）。系统不保存 IP、Cookie、指纹、原始 User-Agent 或 Referrer URL，也不提供独立访客数。</p>
    <p>数据会受重复刷新、浏览器拦截和爬虫识别影响，仅供趋势参考，不用于计费或精确反作弊。</p>
  </aside>;
}

export function DailyTrend({ analytics, compact = false }: { analytics: AdminAnalytics; compact?: boolean }) {
  const highest = Math.max(...analytics.daily.map((point) => point.pv), 0);
  const internalWidth = analytics.range === 400 ? { minWidth: "1200px" } : undefined;
  return <figure className={compact ? styles.compactTrend : styles.dailyTrend} aria-labelledby={compact ? undefined : "daily-trend-title"} aria-describedby={compact ? undefined : "daily-trend-summary"}>
    {compact ? null : <figcaption>
      <h2 id="daily-trend-title">每日趋势</h2>
      <p className={styles.analyticsMetric}><strong>{pv(analytics.totalPv)}</strong> <span>PV</span></p>
      <p>所选时段匿名页面浏览量 · 最高单日 {pv(highest)} PV</p>
      <p id="daily-trend-summary" className={styles.srOnly}>{analytics.fromDay} 至 {analytics.toDay} 共 {analytics.totalPv} PV，最高单日 {highest} PV。</p>
    </figcaption>}
    <div className={styles.trendScroll} tabIndex={0} aria-label="每日 PV 趋势图，可横向滚动">
      {highest === 0 ? <p className={styles.trendZero}>所选时段还没有浏览记录</p> : <ol className={styles.trendBars} aria-hidden="true" style={internalWidth}>
        {analytics.daily.map((point) => <li key={point.day} style={{ "--bar-ratio": Math.max(0, Math.min(1, point.pv / highest)) } as React.CSSProperties} />)}
      </ol>}
    </div>
    <p className={styles.trendDates}><span>{analytics.fromDay}</span><span>{analytics.toDay}</span></p>
  </figure>;
}

export function AnalyticsRangeNav({ range }: { range: AdminAnalytics["range"] }) {
  return <nav className={styles.rangeNav} aria-label="统计时间范围">
    {([7, 30, 90, 400] as const).map((value) => <a key={value} href={`/admin/analytics?range=${value}`} aria-current={range === value ? "page" : undefined}>{value} 天</a>)}
  </nav>;
}

export function AnalyticsDetails({ analytics }: { analytics: AdminAnalytics }) {
  const isZero = analytics.totalPv === 0;
  return <>
    {isZero ? <section className={styles.zeroPanel} aria-labelledby="zero-analytics-title"><h2 id="zero-analytics-title">所选时段还没有浏览记录</h2><p>公开文章产生匿名浏览后，每日趋势会显示在这里。</p></section> : null}
    <details className={styles.dailyDetails}>
      <summary>查看每日数据</summary>
      <div className={styles.tableScroll}><table><thead><tr><th>日期</th><th>PV</th></tr></thead><tbody>{[...analytics.daily].reverse().map((point) => <tr key={point.day}><td>{point.day}</td><td>{pv(point.pv)}</td></tr>)}</tbody></table></div>
    </details>
    <div className={styles.analyticsSplit}>
      <section className={styles.sourcePanel} aria-labelledby="source-title"><h2 id="source-title">来源分布</h2>
        {isZero ? <><h3>所选时段还没有来源数据</h3><p>文章产生匿名浏览后，粗粒度来源会显示在这里。</p></> : <ul className={styles.sourceList}>{analytics.sources.map((source) => <li key={source.source}>
          <div><strong>{sourceLabels[source.source][0]}</strong><span>{pv(source.totalPv)} PV · {percent(source.totalPv, analytics.totalPv)}%</span></div><p>{sourceLabels[source.source][1]}</p><i aria-hidden="true" style={{ "--bar-ratio": Math.max(0, Math.min(1, source.totalPv / analytics.totalPv)) } as React.CSSProperties} />
        </li>)}</ul>}
        <p className={styles.finePrint}>来源仅根据请求当时的 Referrer 粗略归类；原始地址不会保存。</p>
      </section>
      <section className={styles.topPanel} aria-labelledby="top-title"><h2 id="top-title">热门文章</h2>
        {analytics.topArticles.length === 0 ? <><h3>所选时段还没有热门文章</h3><p>有匿名浏览记录后，文章会按 PV 排列在这里。</p></> : <div className={styles.tableScroll}><table><caption className={styles.srOnly}>热门文章</caption><thead><tr><th>排名</th><th>文章</th><th>当前状态</th><th>PV</th><th>占比</th></tr></thead><tbody>{analytics.topArticles.map((article, index) => <tr key={article.articleId}><td>{index + 1}</td><td><a href={`/admin/posts/${article.articleId}`}>{article.title}</a></td><td>已发布</td><td>{pv(article.totalPv)}</td><td>{percent(article.totalPv, analytics.totalPv)}%</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </>;
}

export function AnalyticsFailure({ range, dashboard = false }: { range: AdminAnalytics["range"]; dashboard?: boolean }) {
  return <section className={styles.errorPanel} role="alert" aria-labelledby={dashboard ? "dashboard-analytics-error" : "analytics-error"}>
    <h2 id={dashboard ? "dashboard-analytics-error" : "analytics-error"}>{dashboard ? "访问趋势暂时不可用" : "暂时无法读取访问统计"}</h2>
    <p>{dashboard ? "内容管理仍可继续，稍后再查看统计。" : "统计服务似乎暂时不可用，文章内容和已有统计没有改变。"}</p>
    <p><a href={dashboard ? "/admin#recent-analytics" : `/admin/analytics?range=${range}`}>{dashboard ? "重试统计" : "重试当前范围"}</a>{dashboard ? null : <><span aria-hidden="true"> · </span><a href="/admin">返回工作台</a></>}</p>
  </section>;
}
