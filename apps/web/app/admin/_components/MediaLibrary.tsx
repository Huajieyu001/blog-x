"use client";

import { mediaCatalogResponseSchema, type MediaReference } from "@blog-x/contracts";
import { useEffect, useState } from "react";
import styles from "../admin.module.css";

type Catalog = ReturnType<typeof mediaCatalogResponseSchema.parse>;

export default function MediaLibrary({ onSelect }: { onSelect: (media: MediaReference) => void }) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setMessage("正在加载媒体目录…");
    void fetch(`/api/admin/media?page=${page}&q=${encodeURIComponent(appliedQuery)}`, { credentials: "same-origin" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(response.status === 401 ? "登录状态已失效，请重新登录。" : "媒体目录暂时无法加载。");
        const parsed = mediaCatalogResponseSchema.safeParse(body);
        if (!parsed.success) throw new Error("媒体目录响应无效。");
        if (!cancelled) {
          setCatalog(parsed.data);
          setMessage(parsed.data.items.length ? "" : "这一页没有媒体。"
          );
        }
      })
      .catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "媒体目录暂时无法加载。"); });
    return () => { cancelled = true; };
  }, [page, appliedQuery]);

  return (
    <section className={styles.mediaLibrary} aria-labelledby="media-library-title">
      <div className={styles.mediaLibraryHeader}>
        <div><p className={styles.eyebrow}>复用</p><h3 id="media-library-title">已有媒体</h3></div>
        <form onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedQuery(query.trim()); }}>
          <label className={styles.srOnly} htmlFor="media-library-search">按媒体 ID 搜索</label>
          <input id="media-library-search" value={query} maxLength={100} placeholder="媒体 UUID" onChange={(event) => setQuery(event.target.value)} />
          <button type="submit">搜索</button>
        </form>
      </div>
      {catalog?.items.length ? <ul className={styles.mediaLibraryList}>
        {catalog.items.map((item) => <li key={item.id}>
          <img src={item.url} width={item.width} height={item.height} alt="" />
          <div><strong>{item.width} × {item.height}</strong><span>{item.mimeType} · {item.referenceCount ? `已被 ${item.referenceCount} 篇文章引用` : "未被引用"}</span></div>
          <button type="button" onClick={() => onSelect({ ...item, alt: "", decorative: false })}>选择</button>
        </li>)}
      </ul> : null}
      <div className={styles.mediaLibraryPager}>
        <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>上一页</button>
        <span>第 {page} 页</span>
        <button type="button" disabled={!catalog || catalog.items.length < 12} onClick={() => setPage((value) => value + 1)}>下一页</button>
      </div>
      <p className={styles.status} role="status" aria-live="polite">{message}</p>
    </section>
  );
}
