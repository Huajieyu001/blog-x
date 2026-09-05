import { cookies } from "next/headers";
import { getAdminAnalytics, getAdminPostsResult } from "../lib/api";
import { AnalyticsFailure, DailyTrend } from "./_components/AdminAnalytics";
import ArticleActions from "./_components/ArticleActions";
import styles from "./admin.module.css";

function formatShanghai(instant: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(instant));
}

export default async function AdminPage() {
  const cookieHeader = (await cookies()).toString();
  const [content, analytics] = await Promise.all([getAdminPostsResult(cookieHeader), getAdminAnalytics(cookieHeader, 30, 1)]);
  const posts = content.kind === "ok" ? content.data : [];
  const published = posts.filter((post) => post.status === "published");
  const drafts = posts.filter((post) => post.status === "draft");
  const unpublished = posts.filter((post) => post.status === "unpublished");
  const scheduled = drafts.filter((post) => post.scheduledAt);
  const latestDraft = drafts[0];
  return <main className={styles.workspace}>
    <header className={styles.workspaceHeader}><div><p className={styles.eyebrow}>BLOG X / 管理</p><h1>工作台</h1><p>查看内容状态，继续写作，了解近期阅读趋势。</p></div><a className={styles.primaryLink} href="/admin/new">新建草稿</a></header>
    <section className={styles.workspaceSection} aria-labelledby="overview-title"><h2 id="overview-title">内容概况</h2>{content.kind === "upstream_error" ? <ContentFailure title="内容概况暂时不可用" /> : <div className={styles.overviewCards}>
      <article><h3>已发布</h3><strong>{published.length}</strong><p>当前对访客可见</p></article><article><h3>草稿</h3><strong>{drafts.length}</strong><p>{scheduled.length > 0 ? `其中 ${scheduled.length} 篇已预约` : "等待继续编辑"}</p></article><article><h3>已下线</h3><strong>{unpublished.length}</strong><p>保留内容，暂不公开</p></article>
    </div>}</section>
    <div className={styles.focusPanels}>
      <section className={styles.workspaceSection} aria-labelledby="continue-title"><h2 id="continue-title">继续创作</h2>{content.kind === "upstream_error" ? <ContentFailure title="暂时无法读取创作进度" /> : latestDraft ? <article className={styles.focusCard}><h3><a href={`/admin/posts/${latestDraft.id}`}>继续编辑「{latestDraft.title}」</a></h3><p>上次保存：{formatShanghai(latestDraft.version)}</p>{latestDraft.scheduledAt ? <p>计划于 {formatShanghai(latestDraft.scheduledAt)} 发布</p> : null}<a href="/admin/new">新建另一篇草稿</a></article> : <article className={styles.focusCard}><h3>还没有待写草稿</h3><p>从一个标题开始，先把想法保存下来。</p><a href="/admin/new">开始第一篇草稿</a></article>}</section>
      <section className={styles.workspaceSection} id="recent-analytics" aria-labelledby="recent-analytics-title"><h2 id="recent-analytics-title">最近 30 天访问</h2>{analytics.kind === "upstream_error" ? <AnalyticsFailure range={30} dashboard /> : <article className={styles.analyticsSummary}><p className={styles.analyticsMetric}><strong>{analytics.data.totalPv.toLocaleString("zh-CN")}</strong> <span>PV</span></p><p>匿名页面浏览量</p><DailyTrend analytics={analytics.data} compact />{analytics.data.topArticles[0] ? <p>阅读最多：{analytics.data.topArticles[0].title} · {analytics.data.topArticles[0].totalPv.toLocaleString("zh-CN")} PV</p> : null}<a href="/admin/analytics?range=30">查看完整统计 →</a><p className={styles.finePrint}>仅表示匿名、尽力而为的浏览趋势，不是独立访客数。</p></article>}</section>
    </div>
    <section className={styles.workspaceSection} aria-labelledby="posts-title"><h2 id="posts-title">文章管理{content.kind === "ok" ? ` · ${posts.length} 篇` : ""}</h2>{content.kind === "upstream_error" ? <ContentFailure title="暂时无法读取文章列表" /> : <div className={styles.postList}>{posts.length ? posts.map((post) => <ArticleActions key={post.id} post={post} variant="list" />) : <p>还没有文章。新建第一篇草稿，开始记录。 <a href="/admin/new">创建第一篇草稿</a></p>}</div>}</section>
    <section className={styles.workspaceSection} aria-labelledby="maintenance-title"><h2 id="maintenance-title">站点维护</h2><ul className={styles.maintenanceList}><li><a href="/admin/taxonomy">分类与标签</a><span>整理文章的分类与标签。</span></li><li><a href="/admin/about">关于页</a><span>维护站点介绍。</span></li><li><a href="/admin/audit">操作日志</a><span>查看关键管理操作。</span></li><li><form action="/api/admin/export" method="post"><button type="submit">导出文章 Markdown</button></form><span>导出可迁移的内容副本；访问统计不包含在内。</span></li></ul></section>
  </main>;
}

function ContentFailure({ title }: { title: string }) {
  return <article className={styles.errorPanel} role="alert"><h3>{title}</h3><p>文章内容没有改变，请稍后重试。</p><a href="/admin">重新加载工作台</a></article>;
}
