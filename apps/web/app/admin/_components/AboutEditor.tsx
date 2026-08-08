"use client";

import {
  aboutInputSchema,
  aboutPreviewSchema,
  adminAboutSchema,
  type AdminAbout,
} from "@blog-x/contracts";
import { useState } from "react";
import ArticleBody from "../../_components/ArticleBody";
import styles from "../admin.module.css";

function fieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    (fields[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  }
  return fields;
}

export default function AboutEditor({ initial }: { initial: AdminAbout | null }) {
  const [title, setTitle] = useState(initial?.title ?? "关于我");
  const [markdown, setMarkdown] = useState(initial?.markdown ?? "");
  const [version, setVersion] = useState<string | null>(initial?.version ?? null);
  const [published, setPublished] = useState(initial?.status === "published");
  const [previewHtml, setPreviewHtml] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pane, setPane] = useState<"edit" | "preview">("edit");

  function clearError(name: "title" | "markdown") {
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function request(path: "" | "/preview" | "/publish") {
    const parsed = aboutInputSchema.safeParse({ title, markdown, version });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setMessage("请修正标记的字段。");
      return;
    }
    try {
      const response = await fetch(`/api/admin/about${path}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(path === "/publish" ? { version } : parsed.data),
      });
      if (!response.ok) {
        setMessage(response.status === 409 ? "内容已更新，请刷新后重试。" : "保存失败，请重试。");
        return;
      }
      if (path === "/preview") {
        const preview = aboutPreviewSchema.safeParse(await response.json());
        if (!preview.success) {
          setMessage("保存失败，请重试。");
          return;
        }
        setPreviewHtml(preview.data.html);
        setMessage("预览已更新。");
        setPane("preview");
        return;
      }
      const page = adminAboutSchema.safeParse(await response.json());
      if (!page.success) {
        setMessage("保存失败，请重试。");
        return;
      }
      setErrors({});
      setVersion(page.data.version);
      setPublished(page.data.status === "published");
      setMessage(path === "/publish" ? "关于页已发布。" : "草稿已保存。");
    } catch {
      setMessage("保存失败，请重试。");
    }
  }

  const titleError = errors.title?.join("；");
  const markdownError = errors.markdown?.join("；");
  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
        <div><p className={styles.eyebrow}>Blog X / 内容管理</p><h1>关于页</h1></div>
        <a href="/about">查看公开关于页</a>
      </div>
      <p>状态：<strong>{published ? "已发布" : "草稿"}</strong></p>
      <section className={styles.metadata} aria-label="关于页元数据">
        <label>
          标题
          <input
            value={title}
            onChange={(event) => { setTitle(event.target.value); clearError("title"); }}
            aria-invalid={Boolean(titleError)}
            aria-describedby={titleError ? "about-title-error" : undefined}
          />
        </label>
        {titleError ? <p id="about-title-error" className={styles.error}>{titleError}</p> : null}
      </section>
      <div className={styles.mobileTabs} aria-label="关于页编辑器视图">
        <button type="button" aria-pressed={pane === "edit"} onClick={() => setPane("edit")}>编辑</button>
        <button type="button" aria-pressed={pane === "preview"} onClick={() => setPane("preview")}>预览</button>
      </div>
      <section className={styles.editor}>
        <div className={`${styles.pane} ${pane === "preview" ? styles.mobileInactive : styles.mobileActive}`} data-testid="about-editor-source">
          <div className={styles.paneHeader}>Markdown 源码</div>
          <label className={styles.markdownLabel}>
            Markdown
            <textarea
              value={markdown}
              onChange={(event) => { setMarkdown(event.target.value); clearError("markdown"); }}
              aria-invalid={Boolean(markdownError)}
              aria-describedby={markdownError ? "about-markdown-error" : undefined}
            />
          </label>
          {markdownError ? <p id="about-markdown-error" className={styles.error}>{markdownError}</p> : null}
        </div>
        <div className={`${styles.pane} ${pane === "edit" ? styles.mobileInactive : styles.mobileActive}`} data-testid="about-editor-preview">
          <div className={styles.paneHeader}>安全预览</div>
          <div className={styles.preview}>
            {previewHtml ? <ArticleBody renderedHtml={previewHtml} /> : <p>点击“更新预览”查看安全渲染结果。</p>}
          </div>
        </div>
      </section>
      <div className={styles.actionButtons}>
        <button type="button" onClick={() => { void request(""); }}>保存草稿</button>
        <button type="button" onClick={() => { void request("/preview"); }}>更新预览</button>
        <button type="button" disabled={!version} onClick={() => { void request("/publish"); }}>发布</button>
      </div>
      <p className={styles.status} role="status" aria-label="关于页编辑状态">{message}</p>
    </main>
  );
}
