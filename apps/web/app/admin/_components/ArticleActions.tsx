"use client";

import { adminPostSchema, deletedArticleSchema, type AdminPost, type ArticleAction } from "@blog-x/contracts";
import { useEffect, useState } from "react";
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

  useEffect(() => { setPost(initialPost); }, [initialPost]);

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

  if (deleted) return null;
  const controls = (
    <>
      <p className={styles.lifecycleState}>状态：{statusLabels[post.status]}</p>
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
