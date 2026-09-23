"use client";

import {
  mediaCatalogResponseSchema,
  mediaCleanupPendingResponseSchema,
  mediaDeletedResponseSchema,
  mediaInUseResponseSchema,
  type MediaCatalogItem,
  type MediaReference,
} from "@blog-x/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithDeadline, isFetchDeadlineExceeded } from "../../lib/client-fetch";
import styles from "../admin.module.css";

type Catalog = ReturnType<typeof mediaCatalogResponseSchema.parse>;
type Mode = "select" | "manage";
type MediaLibraryProps = { mode?: Mode; onSelect?: (media: MediaReference) => void };
const pageSize = 12;

class MediaCatalogResponseError extends Error {}
class MediaDeleteResponseError extends Error {}

function catalogError(status?: number) {
  return status === 401 ? "登录状态已失效，请重新登录。" : "媒体目录暂时无法加载，请检查连接后重试。";
}

function deleteError(status: number, body: unknown) {
  if (status === 401) return "登录状态已失效，请重新登录。";
  if (status === 409 && mediaInUseResponseSchema.safeParse(body).success) return "该媒体已被内容引用，无法删除。请刷新目录后重试。";
  if (status === 503 && mediaCleanupPendingResponseSchema.safeParse(body).success) return "文件清理暂未完成，媒体尚未删除。请稍后重试。";
  return "删除失败，媒体仍保留在目录中，请重试。";
}

export default function MediaLibrary({ mode = "select", onSelect }: MediaLibraryProps) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState<MediaCatalogItem | null>(null);
  const [pending, setPending] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const confirmButton = useRef<HTMLButtonElement | null>(null);
  const catalogRequest = useRef(0);
  const catalogAbort = useRef<AbortController | null>(null);

  const loadCatalog = useCallback(async (requestedPage: number, requestedQuery: string, keepStatus = false) => {
    catalogAbort.current?.abort();
    const controller = new AbortController();
    catalogAbort.current = controller;
    const request = ++catalogRequest.current;
    setLoadState("loading");
    try {
      const response = await fetchWithDeadline(`/api/admin/media?page=${requestedPage}&q=${encodeURIComponent(requestedQuery)}`, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      const parsed = mediaCatalogResponseSchema.safeParse(body);
      if (!response.ok || !parsed.success) throw new MediaCatalogResponseError(catalogError(response.status));
      // A slower request for a previous page/search must never overwrite the
      // current catalogue or make a stale card look safe to delete.
      if (request !== catalogRequest.current) return;
      if (!parsed.data.items.length && requestedPage > 1) {
        setPage(requestedPage - 1);
        return;
      }
      setPage(parsed.data.page);
      setCatalog(parsed.data);
      setLoadState("ready");
      if (!keepStatus) setMessage(parsed.data.items.length ? "" : "没有找到匹配的媒体。");
    } catch (error) {
      if (controller.signal.aborted || request !== catalogRequest.current) return;
      setLoadState("error");
      setMessage(isFetchDeadlineExceeded(error)
        ? "媒体目录加载超时，请检查连接后重试。"
        : error instanceof MediaCatalogResponseError ? error.message : catalogError());
    }
  }, []);

  useEffect(() => {
    void loadCatalog(page, appliedQuery);
    return () => { catalogRequest.current += 1; catalogAbort.current?.abort(); };
  }, [page, appliedQuery, loadCatalog]);

  useEffect(() => {
    if (!confirming) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        setConfirming(null);
        window.requestAnimationFrame(() => trigger.current?.focus());
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => confirmButton.current?.focus());
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener("keydown", onKeyDown); };
  }, [confirming, pending]);

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    setPage(1);
    if (nextQuery === appliedQuery) {
      void loadCatalog(1, nextQuery);
      return;
    }
    setAppliedQuery(nextQuery);
  }

  function cancelDelete() {
    if (pending) return;
    setConfirming(null);
    window.requestAnimationFrame(() => trigger.current?.focus());
  }

  async function deleteMedia() {
    if (!confirming || pending) return;
    const target = confirming;
    setPending(true);
    setMessage("");
    try {
      const response = await fetchWithDeadline(`/api/admin/media/${target.id}`, { method: "DELETE", credentials: "same-origin" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !mediaDeletedResponseSchema.safeParse(body).success) throw new MediaDeleteResponseError(deleteError(response.status, body));
      setConfirming(null);
      setMessage("媒体已永久删除。");
      await loadCatalog(page, appliedQuery, true);
    } catch (error) {
      setMessage(isFetchDeadlineExceeded(error)
        ? "删除请求超时，服务器可能已完成删除；请刷新目录确认后再重试。"
        : error instanceof MediaDeleteResponseError
          ? error.message
          : "网络中断，删除结果未知；请刷新媒体库确认后再重试。");
    } finally { setPending(false); }
  }

  const items = catalog?.items ?? [];
  const title = mode === "manage" ? "媒体库" : "已有媒体";
  return (
    <section className={`${styles.mediaLibrary} ${mode === "manage" ? styles.mediaLibraryManage : ""}`} aria-labelledby="media-library-title">
      <div className={styles.mediaLibraryHeader}>
        <div><p className={styles.eyebrow}>{mode === "manage" ? "媒体目录" : "复用"}</p><h2 id="media-library-title">{title}</h2></div>
        <form onSubmit={search}>
          <label className={styles.srOnly} htmlFor={`media-library-search-${mode}`}>按媒体 ID 搜索</label>
          <input id={`media-library-search-${mode}`} value={query} maxLength={100} placeholder="媒体 UUID" onChange={(event) => setQuery(event.target.value)} />
          <button type="submit">搜索</button>
        </form>
      </div>
      {loadState === "loading" ? <section className={`${styles.emptyPanel} ${styles.mediaLoading}`} aria-busy="true"><h3>正在加载媒体目录</h3><p>请稍候。</p></section> : null}
      {loadState === "error" ? <section className={styles.errorPanel} role="alert"><h3>暂时无法读取媒体目录</h3><p>{message}</p><div className={styles.errorActions}><button type="button" onClick={() => void loadCatalog(page, appliedQuery)}>重新加载</button></div></section> : null}
      {loadState === "ready" && !items.length ? <section className={styles.emptyPanel}><h3>媒体库为空</h3><p>{appliedQuery ? "没有找到匹配的媒体。" : "上传图片后会显示在这里。"}</p></section> : null}
      {loadState === "ready" && items.length ? <ul className={styles.mediaLibraryList} aria-label={mode === "manage" ? "媒体目录" : "可复用媒体"}>
        {items.map((item) => <li key={item.id} className={styles.mediaLibraryCard}>
          <img src={item.url} width={item.width} height={item.height} alt="" loading="lazy" decoding="async" />
          <div className={styles.mediaLibraryCardBody}>
            <strong>{item.width} × {item.height}</strong><span>{item.mimeType}</span><code>{item.id}</code><span>{item.referenceCount ? `被 ${item.referenceCount} 篇内容引用` : "未被内容引用"}</span>
          </div>
          {mode === "select" && onSelect ? <button type="button" onClick={() => onSelect({ ...item, alt: "", decorative: false })}>选择</button> : null}
          {mode === "manage" && !item.referenced && item.referenceCount === 0 ? <button type="button" className={styles.mediaDeleteButton} aria-controls={confirming?.id === item.id ? `media-delete-dialog-${item.id}` : undefined} aria-expanded={confirming?.id === item.id} disabled={Boolean(confirming)} onClick={(event) => { trigger.current = event.currentTarget; setConfirming(item); }}>删除媒体</button> : null}
          {mode === "manage" && confirming?.id === item.id ? <div id={`media-delete-dialog-${item.id}`} className={styles.mediaDeleteDialog} role="dialog" aria-modal="true" aria-labelledby={`media-delete-dialog-label-${item.id}`}>
            <p id={`media-delete-dialog-label-${item.id}`}>确认永久删除这张未被引用的媒体？删除后文件不可恢复。</p>
            <div className={styles.restoreDialogActions}><button ref={confirmButton} type="button" className={styles.mediaDeleteConfirm} disabled={pending} onClick={() => void deleteMedia()}>{pending ? "正在删除…" : "确认永久删除"}</button><button type="button" disabled={pending} onClick={cancelDelete}>取消</button></div>
          </div> : null}
        </li>)}
      </ul> : null}
      <div className={styles.mediaLibraryPager} aria-label="媒体目录分页"><button type="button" disabled={loadState !== "ready" || page === 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>第 {page} 页</span><button type="button" disabled={loadState !== "ready" || items.length < pageSize} onClick={() => setPage((value) => value + 1)}>下一页</button></div>
      <p className={styles.status} role="status" aria-live="polite">{loadState === "error" ? "" : message}</p>
    </section>
  );
}
