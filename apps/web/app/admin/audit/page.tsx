import type { AuditEvent, AuditEventName } from "@blog-x/contracts";
import { cookies } from "next/headers";
import { getAdminAuditEvents } from "../../lib/api";
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
  coverMedia: "封面媒体", name: "名称", status: "状态",
};

function eventDetail(item: AuditEvent) {
  const details: string[] = [`对象：${item.targetType} · ${item.targetId}`];
  if (item.metadata.previousStatus && item.metadata.status) details.push(`状态：${item.metadata.previousStatus} → ${item.metadata.status}`);
  else if (item.metadata.status) details.push(`状态：${item.metadata.status}`);
  if (item.metadata.changedFields?.length) details.push(`变更：${item.metadata.changedFields.map((field) => fieldLabels[field] ?? field).join("、")}`);
  return details;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const rawCursor = (await searchParams).cursor;
  const cursor = typeof rawCursor === "string" ? rawCursor : undefined;
  const result = await getAdminAuditEvents((await cookies()).toString(), cursor);

  return (
    <section className={styles.management} aria-labelledby="audit-title">
      <div className={styles.managementTitle}>
        <h1 id="audit-title">操作日志</h1>
        <a href="/admin">返回文章管理</a>
      </div>
      <p className={styles.auditIntro}>仅记录成功的关键管理操作。日志不会保存密码、登录令牌、文章正文、文件内容或客户端 IP。</p>
      {!result ? <p role="alert">暂时无法读取操作日志，请稍后重试。</p> : null}
      {result && !result.items.length ? <p>还没有操作记录。</p> : null}
      {result?.items.length ? (
        <div className={styles.auditList} aria-label="管理员操作记录">
          {result.items.map((item) => (
            <article className={styles.auditRow} key={item.id}>
              <div>
                <p className={styles.auditEvent}>{eventLabels[item.event]}</p>
                <p className={styles.auditDetail}>管理员：{item.actorAdministratorId}</p>
              </div>
              <div>{eventDetail(item).map((detail) => <p className={styles.auditDetail} key={detail}>{detail}</p>)}</div>
              <time className={styles.auditTime} dateTime={item.occurredAt}>{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "medium" }).format(new Date(item.occurredAt))}</time>
            </article>
          ))}
        </div>
      ) : null}
      {result?.nextCursor ? <nav className={styles.auditPager} aria-label="操作日志分页"><a href={`/admin/audit?cursor=${encodeURIComponent(result.nextCursor)}`}>查看更早记录</a></nav> : null}
    </section>
  );
}
