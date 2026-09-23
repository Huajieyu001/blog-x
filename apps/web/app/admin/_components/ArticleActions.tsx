"use client";

import { adminPostSchema, deletedArticleSchema, type AdminPost, type ArticleAction } from "@blog-x/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchWithDeadline, isFetchDeadlineExceeded } from "../../lib/client-fetch";
import {
  CHINA_TIMEZONE_OFFSET_MINUTES,
  formatTimezoneOffset,
  scheduleFormStateAtOffset,
  type ScheduleFormState,
} from "./article-actions-schedule";
import styles from "../admin.module.css";

const statusLabels = { draft: "草稿", published: "已发布", unpublished: "已下线" } as const;

function validActions(post: AdminPost): ArticleAction[] {
  if (post.status === "draft") return ["publish", "delete"];
  if (post.status === "published") return ["unpublish", "delete"];
  return ["republish", "delete"];
}

const actionLabels: Record<ArticleAction, string> = {
  publish: "发布",
  unpublish: "下线",
  republish: "重新发布",
  delete: "删除",
};

const ambiguousMutationTimeoutMessage = "请求超时，服务器可能已完成操作；请先刷新确认后再重试";

function formatShanghai(instant: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instant));
}

function browserOffsetAtInstant(instant: string) {
  return -new Date(instant).getTimezoneOffset();
}

function browserOffsetAtLocalDateTime(localDateTime: string, fallbackOffsetMinutes: number) {
  if (!localDateTime) return fallbackOffsetMinutes;
  const target = new Date(localDateTime);
  return Number.isFinite(target.getTime()) ? -target.getTimezoneOffset() : fallbackOffsetMinutes;
}

export default function ArticleActions({
  post: initialPost,
  variant = "detail",
  onChanged,
  onDeleted,
  disabled = false,
}: {
  post: AdminPost;
  variant?: "detail" | "list";
  onChanged?: (post: AdminPost) => void;
  onDeleted?: () => void;
  disabled?: boolean;
}) {
  const [post, setPost] = useState(initialPost);
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [actionPending, setActionPending] = useState<ArticleAction | null>(null);
  const [schedulePending, setSchedulePending] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => scheduleFormStateAtOffset(initialPost.scheduledAt, CHINA_TIMEZONE_OFFSET_MINUTES));
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

  function scheduleFormForBrowser(nextPost: AdminPost, fallbackOffsetMinutes = CHINA_TIMEZONE_OFFSET_MINUTES) {
    if (nextPost.scheduledAt) return scheduleFormStateAtOffset(nextPost.scheduledAt, browserOffsetAtInstant(nextPost.scheduledAt));
    return scheduleFormStateAtOffset(null, fallbackOffsetMinutes);
  }

  function applyPost(nextPost: AdminPost) {
    setPost(nextPost);
    setScheduleForm(scheduleFormForBrowser(nextPost, browserOffsetAtLocalDateTime(scheduleForm.scheduledAt, CHINA_TIMEZONE_OFFSET_MINUTES)));
  }

  useEffect(() => {
    setPost(initialPost);
    setScheduleForm(scheduleFormForBrowser(initialPost, browserOffsetAtLocalDateTime(scheduleForm.scheduledAt, CHINA_TIMEZONE_OFFSET_MINUTES)));
  }, [initialPost]);

  useEffect(() => {
    if (!pendingDelete) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => cancelDeleteRef.current?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !actionPending) {
        event.preventDefault();
        setPendingDelete(false);
        window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(deleteDialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons.at(-1)!;
      if (!deleteDialogRef.current?.contains(document.activeElement)) {
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
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingDelete, actionPending]);

  function closeDeleteDialog() {
    setPendingDelete(false);
    window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  }

  async function perform(action: ArticleAction) {
    if (disabled || actionPending || schedulePending) return;
    setActionPending(action);
    setMessage(`${actionLabels[action]}中…`);
    try {
      const response = await fetchWithDeadline(`/api/admin/posts/${post.id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        credentials: "same-origin",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = body as { error?: string } | null;
        setMessage(error?.error === "invalid_transition" ? "当前状态不允许此操作，请刷新" : "操作失败，请重试");
        return;
      }
      if (action === "delete") {
        if (!deletedArticleSchema.safeParse(body).success) throw new Error("invalid delete response");
        setPendingDelete(false);
        setDeleted(true);
        setMessage("文章已软删除");
        onDeleted?.();
        return;
      }
      const parsed = adminPostSchema.safeParse(body);
      if (!parsed.success) throw new Error("invalid lifecycle response");
      applyPost(parsed.data);
      setMessage(`${actionLabels[action]}成功`);
      onChanged?.(parsed.data);
    } catch (error) {
      setMessage(isFetchDeadlineExceeded(error) ? ambiguousMutationTimeoutMessage : "网络异常，请重试");
    } finally {
      setActionPending(null);
    }
  }

  function changedFromResponse(body: unknown, success: string) {
    const parsed = adminPostSchema.safeParse(body);
    if (!parsed.success) throw new Error("invalid schedule response");
    applyPost(parsed.data);
    setMessage(success);
    onChanged?.(parsed.data);
  }

  async function schedule(event: FormEvent<HTMLFormElement>) {
    if (disabled || schedulePending || actionPending) return;
    event.preventDefault();
    setSchedulePending(true);
    setMessage(post.scheduledAt ? "改期预约中…" : "设定预约中…");
    try {
      const form = new FormData(event.currentTarget);
      const body = new URLSearchParams();
      form.forEach((value, key) => { if (typeof value === "string") body.append(key, value); });
      const response = await fetchWithDeadline(`/api/admin/posts/${post.id}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body,
        credentials: "same-origin",
      });
      const bodyJson: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage((bodyJson as { error?: string } | null)?.error === "validation_failed" ? "请检查预约时间与 UTC 偏移" : "预约发布失败，请重试");
        return;
      }
      changedFromResponse(bodyJson, post.scheduledAt ? "改期预约成功" : "已设定预约");
    } catch (error) {
      setMessage(isFetchDeadlineExceeded(error) ? ambiguousMutationTimeoutMessage : "网络异常，请重试");
    } finally {
      setSchedulePending(false);
    }
  }

  async function cancelSchedule(event: FormEvent<HTMLFormElement>) {
    if (disabled || schedulePending || actionPending) return;
    event.preventDefault();
    setSchedulePending(true);
    setMessage("取消预约中…");
    try {
      const response = await fetchWithDeadline(`/api/admin/posts/${post.id}/schedule/cancel`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: "",
        credentials: "same-origin",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage("取消预约失败，请刷新后重试");
        return;
      }
      changedFromResponse(body, "已取消预约发布");
    } catch (error) {
      setMessage(isFetchDeadlineExceeded(error) ? ambiguousMutationTimeoutMessage : "网络异常，请重试");
    } finally {
      setSchedulePending(false);
    }
  }

  if (deleted) return null;
  const mutationBusy = disabled || schedulePending || Boolean(actionPending);
  const scheduleHintId = `schedule-timezone-${post.id}`;
  const controls = (
    <>
      <p className={styles.lifecycleState}>状态：{statusLabels[post.status]}</p>
      {post.status === "draft" && (
        <div className={styles.scheduleControls}>
          {post.scheduledAt ? <p className={styles.scheduledAt}>当前预约（上海时间）：{formatShanghai(post.scheduledAt)}</p> : null}
          <form aria-label="预约发布" className={styles.scheduleForm} action={`/api/admin/posts/${post.id}/schedule`} method="post" onSubmit={(event) => { void schedule(event); }}>
            <label>预约发布时间<input name="scheduledAt" type="datetime-local" required aria-describedby={scheduleHintId} value={scheduleForm.scheduledAt} onChange={(event) => {
              const scheduledAt = event.target.value;
              const offsetMinutes = browserOffsetAtLocalDateTime(scheduledAt, CHINA_TIMEZONE_OFFSET_MINUTES);
              setScheduleForm({ scheduledAt, timezoneOffset: formatTimezoneOffset(offsetMinutes) });
            }} disabled={mutationBusy} /></label>
            <label>UTC 偏移<input name="timezoneOffset" inputMode="text" pattern="[+-](0[0-9]|1[0-4]):[0-5][0-9]" required aria-describedby={scheduleHintId} value={scheduleForm.timezoneOffset} onChange={(event) => setScheduleForm((current) => ({ ...current, timezoneOffset: event.target.value }))} disabled={mutationBusy} /></label>
            <button type="submit" disabled={mutationBusy}>{schedulePending ? "预约处理中…" : post.scheduledAt ? "改期预约" : "设定预约"}</button>
          </form>
          <p id={scheduleHintId} className={styles.scheduleHint}>输入框按当前设备时区解释，UTC 偏移会随所选时间自动更新。</p>
          {post.scheduledAt ? (
            <form action={`/api/admin/posts/${post.id}/schedule/cancel`} method="post" onSubmit={(event) => { void cancelSchedule(event); }}>
              <button type="submit" disabled={mutationBusy}>取消预约</button>
            </form>
          ) : null}
        </div>
      )}
      <div className={styles.actionButtons}>
        {validActions(post).map((action) => action === "delete"
          ? <button ref={deleteTriggerRef} className={styles.dangerButton} type="button" key={action} disabled={mutationBusy} onClick={() => setPendingDelete(true)}>{actionLabels[action]}</button>
          : <button type="button" key={action} disabled={mutationBusy} onClick={() => { void perform(action); }}>{actionPending === action ? `${actionLabels[action]}中…` : actionLabels[action]}</button>)}
      </div>
      <p role="status" aria-label="生命周期状态" className={styles.actionStatus}>{message || (disabled ? "请先保存更改或处理恢复副本" : "")}</p>
      {pendingDelete && (
        <div className={styles.dialogBackdrop}>
          <section ref={deleteDialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`delete-title-${post.id}`} aria-describedby={`delete-description-${post.id}`}>
            <h2 id={`delete-title-${post.id}`}>确认软删除文章</h2>
            <p id={`delete-description-${post.id}`}>文章会立即从普通管理与公开访问中移除，但源文件和 Slug 将继续保留，可在后续恢复流程中使用。</p>
            <div className={styles.dialogActions}>
              <button ref={cancelDeleteRef} type="button" disabled={Boolean(actionPending)} onClick={closeDeleteDialog}>取消</button>
              <button className={styles.dangerButton} type="button" disabled={mutationBusy} onClick={() => { void perform("delete"); }}>{actionPending === "delete" ? "删除中…" : "确认软删除"}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );

  if (variant === "list") {
    return (
      <article className={styles.postRow} data-testid={`admin-post-${post.slug}`}>
        <header className={styles.postRowHeader}>
          <span className={styles.postStatus} data-status={post.status}>{statusLabels[post.status]}</span>
          {post.scheduledAt ? <span className={styles.scheduleBadge}>已预约</span> : null}
        </header>
        <h3 className={styles.postRowTitle}><a href={`/admin/posts/${post.id}`}>{post.title}</a></h3>
        {post.summary ? <p className={styles.postSummary}>{post.summary}</p> : null}
        <div className={styles.postMeta}>
          <span title={post.slug}>/{post.slug}</span>
          <span>更新于 {formatShanghai(post.version)}</span>
          {post.scheduledAt ? <span>计划于 {formatShanghai(post.scheduledAt)} 发布</span> : null}
        </div>
        <footer className={styles.postRowFooter}>
          <a className={styles.editPostLink} href={`/admin/posts/${post.id}`}>编辑文章</a>
          <details className={styles.postActions}>
            <summary>管理操作</summary>
            <div className={styles.postActionsBody}>{controls}</div>
          </details>
        </footer>
      </article>
    );
  }
  return <section className={styles.lifecycle} aria-label="文章生命周期">{controls}</section>;
}
