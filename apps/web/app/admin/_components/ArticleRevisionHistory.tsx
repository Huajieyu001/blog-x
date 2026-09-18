"use client";

import {
  articleRevisionDetailSchema,
  type AdminPost,
  type ArticleRevisionDetail,
  type ArticleRevisionSummary,
} from "@blog-x/contracts";
import { useState } from "react";
import styles from "../admin.module.css";

type DetailState =
  | { kind: "idle" }
  | { kind: "loading"; id: string }
  | { kind: "error"; id: string }
  | { kind: "loaded"; detail: ArticleRevisionDetail };

const fieldLabels: Record<string, string> = {
  title: "标题",
  summary: "摘要",
  coverUrl: "封面地址",
  slug: "Slug",
  markdown: "正文",
  publishedAt: "发布时间",
  seoDescription: "SEO 描述",
  categoryId: "分类",
  tagIds: "标签",
  coverMedia: "封面媒体",
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export default function ArticleRevisionHistory({
  article,
  revisions,
  unavailable,
}: {
  article: AdminPost;
  revisions: ArticleRevisionSummary[];
  unavailable: boolean;
}) {
  const [detail, setDetail] = useState<DetailState>({ kind: "idle" });

  async function inspect(revision: ArticleRevisionSummary) {
    setDetail({ kind: "loading", id: revision.id });
    try {
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(article.id)}/revisions/${encodeURIComponent(revision.id)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const parsed = response.ok ? articleRevisionDetailSchema.safeParse(await response.json()) : { success: false as const };
      if (!parsed.success) throw new Error("revision_detail_unavailable");
      setDetail({ kind: "loaded", detail: parsed.data });
    } catch {
      setDetail({ kind: "error", id: revision.id });
    }
  }

  return (
    <section className={styles.revisionHistory} aria-labelledby="revision-history-title" data-testid="article-revision-history">
      <header className={styles.revisionHistoryHeader}>
        <div>
          <p className={styles.eyebrow}>文章历史</p>
          <h2 id="revision-history-title">保存的版本</h2>
        </div>
        <span className={styles.revisionCount}>{revisions.length} / 20</span>
      </header>
      {unavailable ? <p className={styles.revisionError} role="status">历史记录暂时无法读取，当前文章不受影响。</p> : null}
      {!unavailable && revisions.length === 0 ? <p className={styles.revisionEmpty}>尚无可恢复的历史版本。内容实际变更后会自动保留最近 20 个版本。</p> : null}
      {revisions.length ? (
        <ol className={styles.revisionList}>
          {revisions.map((revision) => (
            <li key={revision.id}>
              <div>
                <time dateTime={revision.createdAt}>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(revision.createdAt))}</time>
                <p>{revision.changedFields.map((field) => fieldLabels[field] ?? field).join("、") || "内容变更"}</p>
              </div>
              <button type="button" onClick={() => void inspect(revision)} disabled={detail.kind === "loading"} aria-controls="revision-comparison">
                {detail.kind === "loading" && detail.id === revision.id ? "正在加载…" : "查看对比"}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {detail.kind === "error" ? <p className={styles.revisionError} role="alert">无法读取该历史版本，请稍后重试。</p> : null}
      {detail.kind === "loaded" ? (
        <section id="revision-comparison" className={styles.revisionComparison} aria-live="polite">
          <header>
            <h3>历史版本与当前内容</h3>
            <p>以下内容仅供比较；文本会以纯文本显示。</p>
          </header>
          <div className={styles.revisionColumns}>
            <article>
              <h4>历史版本</h4>
              {detail.detail.changedFields.map((field) => <RevisionValue key={field} label={fieldLabels[field] ?? field} value={detail.detail.revision.snapshot[field]} />)}
            </article>
            <article>
              <h4>当前内容</h4>
              {detail.detail.changedFields.map((field) => <RevisionValue key={field} label={fieldLabels[field] ?? field} value={detail.detail.current[field]} />)}
            </article>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function RevisionValue({ label, value }: { label: string; value: unknown }) {
  return <div className={styles.revisionValue}><h5>{label}</h5><pre>{displayValue(value)}</pre></div>;
}
