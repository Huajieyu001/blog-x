"use client";

import { adminPostSchema, deletedArticleSchema, type AdminPost, type ArticleAction } from "@blog-x/contracts";
import { useEffect, useState, type FormEvent } from "react";
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

function initialTimezoneOffset() {
  // The server-rendered form remains usable without JavaScript. +08:00 is a
  // clear, editable China-local default; hydration replaces it with the
  // visitor's numeric browser offset when enhancement is available.
  return "+08:00";
}

function browserTimezoneOffset() {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
  const [schedulePending, setSchedulePending] = useState(false);
  const [timezoneOffset, setTimezoneOffset] = useState(initialTimezoneOffset);

  useEffect(() => {
    setPost(initialPost);
    setTimezoneOffset(browserTimezoneOffset());
  }, [initialPost]);

  async function perform(action: ArticleAction) {
    if (disabled) return;
    setMessage(`${actionLabels[action]}中…`);
    try {
      const response = await fetch(`/api/admin/posts/${post.id}/${action}`, {
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
      setPost(parsed.data);
      setMessage(`${actionLabels[action]}成功`);
      onChanged?.(parsed.data);
    } catch {
      setMessage("网络异常，请重试");
    }
  }

  function changedFromResponse(body: unknown, success: string) {
    const parsed = adminPostSchema.safeParse(body);
    if (!parsed.success) throw new Error("invalid schedule response");
    setPost(parsed.data);
    setMessage(success);
    onChanged?.(parsed.data);
  }

  async function schedule(event: FormEvent<HTMLFormElement>) {
    if (disabled || schedulePending) return;
    event.preventDefault();
    setSchedulePending(true);
    setMessage(post.scheduledAt ? "改期预约中…" : "预约发布中…");
    try {
      const form = new FormData(event.currentTarget);
      const body = new URLSearchParams();
      form.forEach((value, key) => { if (typeof value === "string") body.append(key, value); });
      const response = await fetch(`/api/admin/posts/${post.id}/schedule`, {
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
      changedFromResponse(bodyJson, post.scheduledAt ? "改期预约成功" : "预约发布成功");
    } catch {
      setMessage("网络异常，请重试");
    } finally {
      setSchedulePending(false);
    }
  }

  async function cancelSchedule(event: FormEvent<HTMLFormElement>) {
    if (disabled || schedulePending) return;
    event.preventDefault();
    setSchedulePending(true);
    setMessage("取消预约中…");
    try {
      const response = await fetch(`/api/admin/posts/${post.id}/schedule/cancel`, {
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
    } catch {
      setMessage("网络异常，请重试");
    } finally {
      setSchedulePending(false);
    }
  }

  if (deleted) return null;
  const controls = (
    <>
      <p className={styles.lifecycleState}>状态：{statusLabels[post.status]}</p>
      {post.status === "draft" && (
        <div className={styles.scheduleControls}>
          {post.scheduledAt ? <p className={styles.scheduledAt}>当前预约：{post.scheduledAt}</p> : null}
          <form aria-label="预约发布" className={styles.scheduleForm} action={`/api/admin/posts/${post.id}/schedule`} method="post" onSubmit={(event) => { void schedule(event); }}>
            <label>预约发布时间<input name="scheduledAt" type="datetime-local" required defaultValue={toLocalDateTime(post.scheduledAt)} disabled={disabled || schedulePending} /></label>
            <label>UTC 偏移<input name="timezoneOffset" inputMode="text" pattern="[+-](0[0-9]|1[0-4]):[0-5][0-9]" required value={timezoneOffset} onChange={(event) => setTimezoneOffset(event.target.value)} disabled={disabled || schedulePending} /></label>
            <button type="submit" disabled={disabled || schedulePending}>{post.scheduledAt ? "改期预约" : "预约发布"}</button>
          </form>
          {post.scheduledAt ? (
            <form action={`/api/admin/posts/${post.id}/schedule/cancel`} method="post" onSubmit={(event) => { void cancelSchedule(event); }}>
              <button type="submit" disabled={disabled || schedulePending}>取消预约</button>
            </form>
          ) : null}
        </div>
      )}
      <div className={styles.actionButtons}>
        {validActions(post).map((action) => action === "delete"
          ? <button className={styles.dangerButton} type="button" key={action} disabled={disabled} onClick={() => setPendingDelete(true)}>{actionLabels[action]}</button>
          : <button type="button" key={action} disabled={disabled} onClick={() => { void perform(action); }}>{actionLabels[action]}</button>)}
      </div>
      <p role="status" aria-label="生命周期状态" className={styles.actionStatus}>{message || (disabled ? "请先保存更改或处理恢复副本" : "")}</p>
      {pendingDelete && (
        <div className={styles.dialogBackdrop}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`delete-title-${post.id}`}>
            <h2 id={`delete-title-${post.id}`}>确认软删除文章</h2>
            <p>文章会立即从普通管理与公开访问中移除，但源文件和 Slug 将继续保留，可在后续恢复流程中使用。</p>
            <div className={styles.dialogActions}>
              <button type="button" onClick={() => setPendingDelete(false)}>取消</button>
              <button className={styles.dangerButton} type="button" disabled={disabled} onClick={() => { void perform("delete"); }}>确认软删除</button>
            </div>
          </section>
        </div>
      )}
    </>
  );

  if (variant === "list") {
    return (
      <article className={styles.postRow} data-testid={`admin-post-${post.slug}`}>
        <div><a href={`/admin/posts/${post.id}`}>{post.title}</a><p>{post.slug}</p></div>
        <div>{controls}</div>
      </article>
    );
  }
  return <section className={styles.lifecycle} aria-label="文章生命周期">{controls}</section>;
}
