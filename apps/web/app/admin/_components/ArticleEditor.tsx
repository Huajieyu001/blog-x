"use client";

import {
  adminPostInputSchema,
  adminPostPreviewSchema,
  adminPostSchema,
  type AdminPost,
  type AdminPostInput,
  suggestSlug,
} from "@blog-x/contracts";
import { useEffect, useRef, useState } from "react";
import styles from "../admin.module.css";

type EditorFields = Omit<AdminPostInput, "publishedAt"> & { publishedAt: string };

const emptyFields: EditorFields = {
  title: "",
  summary: "",
  coverUrl: "",
  slug: "",
  markdown: "",
  publishedAt: "",
  seoDescription: "",
};

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialFields(post?: AdminPost): EditorFields {
  if (!post) return emptyFields;
  return {
    title: post.title,
    summary: post.summary,
    coverUrl: post.coverUrl,
    slug: post.slug,
    markdown: post.markdown,
    publishedAt: toLocalDateTime(post.publishedAt),
    seoDescription: post.seoDescription,
  };
}

function zodFieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}

export default function ArticleEditor({ post, heading }: { post?: AdminPost; heading: string }) {
  const [fields, setFields] = useState(() => initialFields(post));
  const [postId, setPostId] = useState(post?.id);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");
  const slugManuallyEdited = useRef(Boolean(post));
  const previewSequence = useRef(0);

  useEffect(() => {
    const sequence = ++previewSequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewMessage("预览中…");
      try {
        const response = await fetch("/api/admin/posts/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markdown: fields.markdown }),
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("preview failed");
        const parsed = adminPostPreviewSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("invalid preview response");
        if (sequence === previewSequence.current) {
          setPreviewHtml(parsed.data.html);
          setPreviewMessage("");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (sequence === previewSequence.current) setPreviewMessage(error instanceof Error ? "预览暂时不可用" : "预览失败");
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fields.markdown]);

  function update<K extends keyof EditorFields>(name: K, value: EditorFields[K]) {
    setFields((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function updateTitle(title: string) {
    setFields((current) => ({
      ...current,
      title,
      slug: slugManuallyEdited.current ? current.slug : suggestSlug(title),
    }));
  }

  async function save() {
    setMessage("保存中…");
    const candidate = {
      ...fields,
      publishedAt: fields.publishedAt ? new Date(fields.publishedAt).toISOString() : null,
    };
    const parsed = adminPostInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      setMessage("请修正标记的字段");
      return;
    }
    try {
      const response = await fetch(postId ? `/api/admin/posts/${postId}` : "/api/admin/posts", {
        method: postId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
        credentials: "same-origin",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const apiError = body as { fields?: Record<string, string[]>; error?: string } | null;
        if (apiError?.fields) setErrors(apiError.fields);
        setMessage(apiError?.error === "slug_conflict" ? "Slug 已被占用" : "草稿保存失败，请重试");
        return;
      }
      const saved = adminPostSchema.safeParse(body);
      if (!saved.success) throw new Error("invalid save response");
      setErrors({});
      setMessage("草稿已保存");
      if (!postId) {
        setPostId(saved.data.id);
        window.history.replaceState(window.history.state, "", `/admin/posts/${saved.data.id}`);
      }
    } catch {
      setMessage("网络异常，草稿内容仍保留在编辑器中");
    }
  }

  function errorFor(name: keyof EditorFields) {
    return errors[name]?.join("；");
  }

  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
        <div><p className={styles.eyebrow}>Blog X / 内容管理</p><h1>{heading}</h1></div>
        <button className={styles.primaryButton} type="button" onClick={() => { void save(); }}>保存草稿</button>
      </div>

      <section className={styles.metadata} aria-label="文章元数据">
        <label>标题<input value={fields.title} onChange={(event) => updateTitle(event.target.value)} aria-invalid={Boolean(errorFor("title"))} /></label>
        {errorFor("title") && <p className={styles.error}>{errorFor("title")}</p>}
        <label>摘要<textarea rows={3} value={fields.summary} onChange={(event) => update("summary", event.target.value)} /></label>
        {errorFor("summary") && <p className={styles.error}>{errorFor("summary")}</p>}
        <div className={styles.metadataGrid}>
          <label>Slug<input value={fields.slug} onChange={(event) => { slugManuallyEdited.current = true; update("slug", event.target.value); }} aria-invalid={Boolean(errorFor("slug"))} /></label>
          <label>发布时间<input type="datetime-local" value={fields.publishedAt} onChange={(event) => update("publishedAt", event.target.value)} aria-invalid={Boolean(errorFor("publishedAt"))} /></label>
          <label>封面 URL<input type="url" value={fields.coverUrl} onChange={(event) => update("coverUrl", event.target.value)} aria-invalid={Boolean(errorFor("coverUrl"))} /></label>
          <label>SEO 描述<input value={fields.seoDescription} onChange={(event) => update("seoDescription", event.target.value)} aria-invalid={Boolean(errorFor("seoDescription"))} /></label>
        </div>
        {errorFor("slug") && <p className={styles.error}>{errorFor("slug")}</p>}
        {errorFor("publishedAt") && <p className={styles.error}>{errorFor("publishedAt")}</p>}
        {errorFor("coverUrl") && <p className={styles.error}>{errorFor("coverUrl")}</p>}
        {errorFor("seoDescription") && <p className={styles.error}>{errorFor("seoDescription")}</p>}
      </section>

      <div className={styles.mobileTabs} aria-label="编辑器视图">
        <button type="button" aria-pressed={mobilePane === "edit"} onClick={() => setMobilePane("edit")}>编辑</button>
        <button type="button" aria-pressed={mobilePane === "preview"} onClick={() => setMobilePane("preview")}>预览</button>
      </div>
      <section className={styles.editor}>
        <div className={`${styles.pane} ${mobilePane === "edit" ? styles.mobileActive : styles.mobileInactive}`} data-testid="editor-source">
          <div className={styles.paneHeader}>Markdown 源码</div>
          <label className={styles.markdownLabel}>Markdown<textarea value={fields.markdown} onChange={(event) => update("markdown", event.target.value)} spellCheck={false} aria-invalid={Boolean(errorFor("markdown"))} /></label>
          {errorFor("markdown") && <p className={styles.error}>{errorFor("markdown")}</p>}
        </div>
        <div className={`${styles.pane} ${mobilePane === "preview" ? styles.mobileActive : styles.mobileInactive}`} data-testid="editor-preview-pane">
          <div className={styles.paneHeader}><span>安全预览</span><span className={styles.previewStatus}>{previewMessage}</span></div>
          <article className={styles.preview} data-testid="markdown-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      </section>
      <p role="status" className={styles.status}>{message}</p>
    </main>
  );
}
