"use client";

import { taxonomyInputSchema, taxonomyTermSchema } from "@blog-x/contracts";
import { useRef, useState } from "react";
import { fetchWithDeadline, isFetchDeadlineExceeded } from "../../lib/client-fetch";
import styles from "../admin.module.css";

type Term = { id: string; name: string; slug: string; articleCount: number };

export default function TaxonomyManager({ kind, initialTerms }: { kind: "categories" | "tags"; initialTerms: Term[] }) {
  const [terms, setTerms] = useState(initialTerms);
  const [editing, setEditing] = useState<Term | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<Term | null>(null);
  const [busy, setBusy] = useState<"form" | string | null>(null);
  const [status, setStatus] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const activeId = useRef<string | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const label = kind === "categories" ? "分类" : "标签";
  const statusId = `${kind}-taxonomy-status`;
  const errorId = `${kind}-taxonomy-error`;

  function restoreFocus(id = activeId.current) {
    window.requestAnimationFrame(() => {
      if (id && triggers.current.get(id)) triggers.current.get(id)?.focus();
      else statusRef.current?.focus();
    });
  }

  async function save(form: FormData) {
    if (busy) return;
    const payload = taxonomyInputSchema.safeParse({ name: form.get("name"), slug: form.get("slug") });
    if (!payload.success) {
      setInvalid(true);
      setStatus("请修正标记的字段。");
      return;
    }
    setBusy("form");
    setStatus(editing ? `正在更新${label}…` : `正在创建${label}…`);
    try {
      const response = await fetchWithDeadline(`/api/admin/${kind}${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PUT" : "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        setStatus(response.status === 409 ? "名称或 Slug 已存在，请更换后重试。" : "保存失败，请重试。");
        return;
      }
      const parsed = taxonomyTermSchema.safeParse(await response.json());
      if (!parsed.success) {
        setStatus("服务器返回了无法识别的数据，请刷新后重试。");
        return;
      }
      const wasEditing = Boolean(editing);
      setTerms((all) => wasEditing ? all.map((item) => item.id === parsed.data.id ? parsed.data : item) : [...all, parsed.data]);
      setStatus(wasEditing ? `${label}已更新。` : `${label}已创建。`);
      setEditing(null);
      setInvalid(false);
      setFormKey((key) => key + 1);
      if (wasEditing) restoreFocus();
    } catch (error) {
      setStatus(isFetchDeadlineExceeded(error)
        ? "保存请求超时，服务器可能已完成操作；请刷新确认后再重试。"
        : "网络中断，保存结果未知；请刷新确认后再重试。");
    } finally {
      setBusy(null);
    }
  }

  async function remove(term: Term) {
    if (busy) return;
    const index = terms.findIndex((item) => item.id === term.id);
    const nextFocusId = terms[index + 1]?.id ?? terms[index - 1]?.id ?? null;
    setBusy(term.id);
    setStatus(`正在删除${label}“${term.name}”…`);
    try {
      const response = await fetchWithDeadline(`/api/admin/${kind}/${term.id}`, { method: "DELETE", credentials: "same-origin" });
      if (response.status === 409) {
        setStatus("请先移除或重新分配关联文章，才能删除。");
        return;
      }
      if (!response.ok) {
        setStatus("删除失败，请重试。");
        return;
      }
      setTerms((all) => all.filter((item) => item.id !== term.id));
      setConfirmingDelete(null);
      setStatus(`${label}已删除。`);
      restoreFocus(nextFocusId);
    } catch (error) {
      setStatus(isFetchDeadlineExceeded(error)
        ? "删除请求超时，服务器可能已完成操作；请刷新确认后再重试。"
        : "网络中断，删除结果未知；请刷新确认后再重试。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.taxonomyPanel} aria-labelledby={`${kind}-title`} aria-busy={busy ? "true" : undefined}>
      <header className={styles.taxonomyPanelHeader}>
        <div><p className={styles.eyebrow}>{kind}</p><h2 id={`${kind}-title`}>{label}管理</h2></div>
        <span>{terms.length} 项</span>
      </header>
      <form className={styles.taxonomyForm} key={formKey} action={save}>
        <h3>{editing ? `编辑${label}` : `新建${label}`}</h3>
        <div className={styles.taxonomyFormFields}>
          <label>名称<input name="name" defaultValue={editing?.name ?? ""} required disabled={Boolean(busy)} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} /></label>
          <label>Slug<input name="slug" defaultValue={editing?.slug ?? ""} required disabled={Boolean(busy)} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} /></label>
        </div>
        <div className={styles.taxonomyFormActions}>
          <button className={styles.compactPrimaryButton} type="submit" disabled={Boolean(busy)}>{busy === "form" ? "保存中…" : editing ? "保存更改" : `创建${label}`}</button>
          {editing ? <button type="button" disabled={Boolean(busy)} onClick={() => { setEditing(null); setInvalid(false); setFormKey((key) => key + 1); restoreFocus(); }}>取消编辑</button> : null}
        </div>
      </form>
      {invalid ? <p id={errorId} className={styles.error}>请修正标记的字段。</p> : null}
      <p ref={statusRef} id={statusId} className={styles.taxonomyStatus} data-testid="taxonomy-status" role="status" tabIndex={-1}>{status}</p>
      {terms.length ? (
        <ul className={styles.taxonomyList}>
          {terms.map((term) => (
            <li key={term.id}>
              <div className={styles.taxonomyTerm}><strong>{term.name}</strong><code>/{term.slug}</code><span>关联文章 {term.articleCount} 篇</span></div>
              {confirmingDelete?.id === term.id ? (
                <div className={styles.taxonomyDeleteConfirm} role="group" aria-label={`确认删除${term.name}`}>
                  <span>确认删除？</span>
                  <button type="button" disabled={Boolean(busy)} onClick={() => { setConfirmingDelete(null); restoreFocus(term.id); }}>取消</button>
                  <button className={styles.textDangerButton} type="button" disabled={Boolean(busy)} onClick={() => { void remove(term); }}>{busy === term.id ? "删除中…" : "确认删除"}</button>
                </div>
              ) : (
                <div className={styles.taxonomyItemActions}>
                  <button ref={(node) => { if (node) triggers.current.set(term.id, node); else triggers.current.delete(term.id); }} type="button" data-testid={`taxonomy-edit-${term.id}`} aria-label={`编辑${term.name}`} disabled={Boolean(busy)} onClick={() => { activeId.current = term.id; setEditing(term); setInvalid(false); setFormKey((key) => key + 1); }}>编辑</button>
                  <button className={styles.textDangerButton} type="button" disabled={Boolean(busy) || term.articleCount > 0} aria-describedby={term.articleCount > 0 ? `${kind}-${term.id}-delete-help` : undefined} onClick={() => { activeId.current = term.id; setConfirmingDelete(term); }}>删除</button>
                </div>
              )}
              {term.articleCount > 0 ? <span className={styles.taxonomyHelp} id={`${kind}-${term.id}-delete-help`}>请先移除或重新分配关联文章，才能删除。</span> : null}
            </li>
          ))}
        </ul>
      ) : <p className={styles.taxonomyEmpty}>还没有{label}，可从上方创建第一项。</p>}
    </section>
  );
}
