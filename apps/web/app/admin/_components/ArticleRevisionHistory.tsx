"use client";

import {
  articleRevisionDetailSchema,
  type AdminPost,
  type ArticleRevisionDetail,
  type ArticleRevisionSummary,
} from "@blog-x/contracts";
import { useEffect, useRef, useState } from "react";
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
  const [confirmingRestore, setConfirmingRestore] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const restoreTrigger = useRef<HTMLButtonElement | null>(null);
  const restoreDialog = useRef<HTMLDivElement | null>(null);
  const cancelRestoreAction = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!confirmingRestore) return;
    const frame = window.requestAnimationFrame(() => cancelRestoreAction.current?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !restoring) {
        event.preventDefault();
        closeRestoreDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(restoreDialog.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
      if (!buttons.length) {
        event.preventDefault();
        return;
      }
      const first = buttons[0];
      const last = buttons.at(-1)!;
      if (!restoreDialog.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
    };
  }, [confirmingRestore, restoring]);

  function closeRestoreDialog() {
    setConfirmingRestore(null);
    window.requestAnimationFrame(() => restoreTrigger.current?.focus());
  }

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

  async function restore(revisionId: string) {
    setRestoring(true);
    setRestoreError(null);
    try {
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(article.id)}/revisions/${encodeURIComponent(revisionId)}/restore`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: article.version }),
      });
      if (response.status === 409) throw new Error("stale");
      if (!response.ok) throw new Error("restore_failed");
      window.location.reload();
    } catch (error) {
      setRestoreError(error instanceof Error && error.message === "stale"
        ? "文章已被其他保存更新，请刷新后重新选择历史版本。"
        : "恢复失败，当前内容未被更改。请稍后重试。");
      closeRestoreDialog();
    } finally {
      setRestoring(false);
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
          <div className={styles.revisionRestore}>
            {confirmingRestore === detail.detail.revision.id ? (
              <div ref={restoreDialog} className={styles.restoreDialog} role="dialog" aria-modal="true" aria-labelledby="revision-restore-confirmation">
                <p id="revision-restore-confirmation">确认恢复此历史版本吗？当前内容会先保存为新的历史版本，恢复后的文章将回到草稿。</p>
                <div className={styles.restoreDialogActions}>
                  <button type="button" className={styles.restoreConfirm} disabled={restoring} onClick={() => void restore(detail.detail.revision.id)}>{restoring ? "正在恢复…" : "确认恢复"}</button>
                  <button ref={cancelRestoreAction} type="button" disabled={restoring} onClick={closeRestoreDialog}>取消</button>
                </div>
              </div>
            ) : <button ref={restoreTrigger} className={styles.restoreButton} type="button" onClick={(event) => { restoreTrigger.current = event.currentTarget; setConfirmingRestore(detail.detail.revision.id); }}>恢复此版本</button>}
          </div>
        </section>
      ) : null}
      {restoreError ? <p className={styles.revisionError} role="alert">{restoreError}</p> : null}
    </section>
  );
}

function RevisionValue({ label, value }: { label: string; value: unknown }) {
  return <div className={styles.revisionValue}><h5>{label}</h5><pre>{displayValue(value)}</pre></div>;
}
