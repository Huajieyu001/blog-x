import type { AuditEvent, AuditEventName } from "@blog-x/contracts";
import { cookies } from "next/headers";
import { getAdminAuditEventsResult } from "../../lib/api";
import styles from "../admin.module.css";

const eventLabels: Record<AuditEventName, string> = {
  "auth.login.succeeded": "管理员登录",
  "auth.logout.succeeded": "管理员退出",
  "article.created": "创建文章草稿",
  "article.updated": "更新文章",
  "article.published": "发布文章",
  "article.unpublished": "下线文章",
  "article.republished": "重新发布文章",
  "article.deleted": "删除文章",
  "article.scheduled": "预约发布文章",
  "article.rescheduled": "改期发布文章",
  "article.schedule_cancelled": "取消预约发布",
  "article.scheduled_published": "按预约发布文章",
  "category.created": "创建分类",
  "category.updated": "更新分类",
  "category.deleted": "删除分类",
  "tag.created": "创建标签",
  "tag.updated": "更新标签",
  "tag.deleted": "删除标签",
  "about.saved": "保存关于页",
  "about.published": "发布关于页",
};

const fieldLabels: Record<string, string> = {
  title: "标题", summary: "摘要", coverUrl: "旧封面地址", slug: "Slug", markdown: "正文",
  publishedAt: "发布时间", seoDescription: "SEO 描述", categoryId: "分类", tagIds: "标签",
  coverMedia: "封面媒体", name: "名称", status: "状态", scheduledAt: "预约时间",
};

const targetLabels: Record<AuditEvent["targetType"], string> = {
  administrator: "管理员账号",
  article: "文章",
  category: "分类",
  tag: "标签",
  about: "关于页",
};

type AuditStatus = NonNullable<AuditEvent["metadata"]["status"]>;
const statusLabels: Record<AuditStatus, string> = {
  draft: "草稿",
  published: "已发布",
  unpublished: "已下线",
  deleted: "已删除",
};

const shanghaiDateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function formatShanghaiDateTime(value: string) {
  return `${shanghaiDateTime.format(new Date(value))}（上海时间）`;
}

function eventDetail(item: AuditEvent) {
  const details: string[] = [];
  if (item.metadata.previousStatus && item.metadata.status) {
    details.push(`状态：${statusLabels[item.metadata.previousStatus]} → ${statusLabels[item.metadata.status]}`);
  } else if (item.metadata.status) {
    details.push(`状态：${statusLabels[item.metadata.status]}`);
  }
  if (item.metadata.previousScheduledAt && item.metadata.scheduledAt) {
    details.push(`预约时间：${formatShanghaiDateTime(item.metadata.previousScheduledAt)} → ${formatShanghaiDateTime(item.metadata.scheduledAt)}`);
  } else if (item.metadata.scheduledAt) {
    details.push(`预约时间：${formatShanghaiDateTime(item.metadata.scheduledAt)}`);
  } else if (item.metadata.previousScheduledAt) {
    details.push(`原预约时间：${formatShanghaiDateTime(item.metadata.previousScheduledAt)}`);
  }
  if (item.metadata.changedFields?.length) details.push(`变更：${item.metadata.changedFields.map((field) => fieldLabels[field] ?? field).join("、")}`);
  return details;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const rawCursor = (await searchParams).cursor;
  const cursor = typeof rawCursor === "string" ? rawCursor : undefined;
  const result = await getAdminAuditEventsResult((await cookies()).toString(), cursor);
  const events = result.kind === "ok" ? result.data : null;

  return (
    <main className={styles.workspace} aria-labelledby="audit-title">
      <header className={styles.workspaceHeader}>
        <div><p className={styles.eyebrow}>BLOG X / 安全记录</p><h1 id="audit-title">操作日志</h1><p>回顾账号、内容与站点设置的关键变更。</p></div>
        <a className={styles.secondaryLink} href="/admin">返回工作台</a>
      </header>
      <aside className={styles.auditNotice}>仅记录成功的关键管理操作，不保存密码、登录令牌、文章正文、文件内容或客户端 IP。</aside>
      {result.kind === "upstream_error" ? <section className={`${styles.errorPanel} ${styles.adminRouteError}`} role="alert"><h2>暂时无法读取操作日志</h2><p>日志没有改变，请检查连接后重试。</p><a href="/admin/audit">重新加载操作日志</a></section> : null}
      {events && !events.items.length ? <section className={styles.emptyPanel}><h2>还没有操作记录</h2><p>登录、内容发布和站点设置变更会安全地显示在这里。</p></section> : null}
      {events?.items.length ? (
        <div className={styles.auditList} aria-label="管理员操作记录">
          {events.items.map((item) => (
            <article className={styles.auditRow} key={item.id}>
              <div>
                <p className={styles.auditEvent}>{eventLabels[item.event]}</p>
                <p className={styles.auditTarget}>操作对象：{targetLabels[item.targetType]}</p>
              </div>
              <div>
                {eventDetail(item).map((detail) => <p className={styles.auditDetail} key={detail}>{detail}</p>)}
                <p className={styles.auditIdentifier}>执行者 ID：<code>{item.actorAdministratorId}</code></p>
                <p className={styles.auditIdentifier}>对象 ID：<code>{item.targetId}</code></p>
              </div>
              <time className={styles.auditTime} dateTime={item.occurredAt}>
                <span>操作时间</span>
                {formatShanghaiDateTime(item.occurredAt)}
              </time>
            </article>
          ))}
        </div>
      ) : null}
      {events?.nextCursor ? <nav className={styles.auditPager} aria-label="操作日志分页"><a href={`/admin/audit?cursor=${encodeURIComponent(events.nextCursor)}`}>查看更早记录</a></nav> : null}
    </main>
  );
}
