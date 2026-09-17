"use client";
import { useRef, useState } from "react";
import { restoredArticleSchema, type DeletedPost } from "@blog-x/contracts";
import styles from "../admin.module.css";

export default function DeletedPostList({ initial }: { initial: DeletedPost[] }) {
  const [items, setItems] = useState(initial);
  const [confirming, setConfirming] = useState<DeletedPost | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [restored, setRestored] = useState<{ id: string; title: string } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  async function restore() {
    if (!confirming || pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/posts/${confirming.id}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: "{}",
      });
      const parsed = restoredArticleSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error("restore failed");
      setItems((value) => value.filter((item) => item.id !== confirming.id));
      setRestored({ id: confirming.id, title: confirming.title });
      setMessage("文章已恢复为草稿，仍未公开。");
      setConfirming(null);
    } catch {
      setMessage("恢复失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    setConfirming(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  if (!items.length && !restored) return <section className={styles.emptyPanel}><h2>回收站为空</h2><p>删除的文章会显示在这里。</p></section>;
  return (
    <section className={styles.trashSection} aria-label="已删除文章">
      <p className={styles.trashStatus} role="status" aria-live="polite">{message}</p>
      {restored ? <p className={styles.trashRestored}>“{restored.title}”已恢复。<a href={`/admin/posts/${restored.id}`}>打开草稿</a></p> : null}
      {items.length ? <ul className={styles.trashList}>{items.map((item) => (
        <li className={styles.trashCard} key={item.id}>
          <div className={styles.trashCardBody}>
            <h2>{item.title}</h2>
            <p>Slug：<code>{item.slug}</code></p>
            <p>删除前状态：{item.statusBeforeDeletion}</p>
            <p>删除时间：{new Date(item.deletedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（上海时间）</p>
          </div>
          <button
            className={styles.restoreButton}
            aria-controls={confirming?.id === item.id ? `restore-dialog-${item.id}` : undefined}
            aria-expanded={confirming?.id === item.id}
            disabled={Boolean(confirming)}
            onClick={(event) => { trigger.current = event.currentTarget; setConfirming(item); }}
          >恢复为草稿</button>
          {confirming?.id === item.id ? (
            <div id={`restore-dialog-${item.id}`} className={styles.restoreDialog} role="dialog" aria-modal="true" aria-labelledby={`restore-dialog-label-${item.id}`}>
              <p id={`restore-dialog-label-${item.id}`}>确认恢复为未公开草稿？文章不会自动发布。</p>
              <div className={styles.restoreDialogActions}>
                <button className={styles.restoreConfirm} disabled={pending} onClick={() => void restore()}>确认恢复</button>
                <button disabled={pending} onClick={cancel}>取消</button>
              </div>
            </div>
          ) : null}
        </li>
      ))}</ul> : null}
    </section>
  );
}
