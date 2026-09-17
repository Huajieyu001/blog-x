"use client";
import { useRef, useState } from "react";
import { restoredArticleSchema, type DeletedPost } from "@blog-x/contracts";

export default function DeletedPostList({ initial }: { initial: DeletedPost[] }) {
  const [items, setItems] = useState(initial); const [confirming, setConfirming] = useState<DeletedPost | null>(null); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const trigger = useRef<HTMLButtonElement>(null);
  async function restore() { if (!confirming || pending) return; setPending(true); setMessage(""); try { const response = await fetch(`/api/admin/posts/${confirming.id}/restore`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: "{}" }); const parsed = restoredArticleSchema.safeParse(await response.json()); if (!response.ok || !parsed.success) throw new Error(); setItems((value) => value.filter((item) => item.id !== confirming.id)); setMessage("文章已恢复为草稿，仍未公开。"); setConfirming(null); } catch { setMessage("恢复失败，请重试。"); } finally { setPending(false); } }
  if (!items.length) return <section><h2>回收站为空</h2><p>删除的文章会显示在这里。</p></section>;
  return <section aria-label="已删除文章"><p role="status">{message}</p><ul>{items.map((item) => <li key={item.id}><h2>{item.title}</h2><p>Slug：{item.slug} · 删除前：{item.statusBeforeDeletion}</p><p>删除时间：{new Date(item.deletedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>{confirming?.id === item.id ? <div role="dialog" aria-modal="true"><p>确认恢复为未公开草稿？</p><button disabled={pending} onClick={() => void restore()}>确认恢复</button><button disabled={pending} onClick={() => { setConfirming(null); trigger.current?.focus(); }}>取消</button></div> : <button ref={trigger} onClick={(event) => { trigger.current = event.currentTarget; setConfirming(item); }}>恢复为草稿</button>}</li>)}</ul></section>;
}
