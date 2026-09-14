"use client";

import {
  aboutInputSchema,
  aboutPreviewSchema,
  adminAboutSchema,
  type AdminAbout,
} from "@blog-x/contracts";
import { useEffect, useState } from "react";
import ArticleBody from "../../_components/ArticleBody";
import styles from "../admin.module.css";

type AboutAction = "save" | "preview" | "publish";

const actionCopy: Record<AboutAction, { pending: string; failed: string; invalid: string }> = {
  save: { pending: "正在保存…", failed: "草稿保存失败，请重试。", invalid: "服务器返回了无法识别的草稿，请重试。" },
  preview: { pending: "正在生成预览…", failed: "预览生成失败，请重试。", invalid: "服务器返回了无法识别的预览，请重试。" },
  publish: { pending: "正在发布…", failed: "关于页发布失败，请重试。", invalid: "服务器返回了无法识别的发布结果，请重试。" },
};

function aboutSnapshot(title: string, markdown: string) {
  return JSON.stringify([title, markdown]);
}

function fieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    (fields[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  }
  return fields;
}

export default function AboutEditor({ initial }: { initial: AdminAbout | null }) {
  const initialTitle = initial?.title ?? "关于我";
  const initialMarkdown = initial?.markdown ?? "";
  const [title, setTitle] = useState(initialTitle);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [savedSnapshot, setSavedSnapshot] = useState(() => aboutSnapshot(initialTitle, initialMarkdown));
  const [version, setVersion] = useState<string | null>(initial?.version ?? null);
  const [published, setPublished] = useState(initial?.status === "published");
  const [previewHtml, setPreviewHtml] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [pending, setPending] = useState<AboutAction | null>(null);
  const dirty = aboutSnapshot(title, markdown) !== savedSnapshot;

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function clearError(name: "title" | "markdown") {
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function request(path: "" | "/preview" | "/publish") {
    if (pending) return;
    const action: AboutAction = path === "/preview" ? "preview" : path === "/publish" ? "publish" : "save";
    if (action === "publish" && dirty) {
      setMessage("当前有未保存更改，请先保存草稿再发布。");
      return;
    }
    const parsed = aboutInputSchema.safeParse({ title, markdown, version });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setMessage("请修正标记的字段。");
      return;
    }

    setPending(action);
    setMessage(actionCopy[action].pending);
    try {
      const response = await fetch(`/api/admin/about${path}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(path === "/publish" ? { version } : parsed.data),
      });
      if (!response.ok) {
        setMessage(response.status === 409
          ? "内容已在其他位置更新，请刷新页面后再提交。"
          : actionCopy[action].failed);
        return;
      }
      if (path === "/preview") {
        const preview = aboutPreviewSchema.safeParse(await response.json().catch(() => null));
        if (!preview.success) {
          setMessage(actionCopy.preview.invalid);
          return;
        }
        setPreviewHtml(preview.data.html);
        setMessage("预览已更新。");
        setPane("preview");
        return;
      }
      const page = adminAboutSchema.safeParse(await response.json().catch(() => null));
      if (!page.success) {
        setMessage(actionCopy[action].invalid);
        return;
      }
      setErrors({});
      setTitle(page.data.title);
      setMarkdown(page.data.markdown);
      setSavedSnapshot(aboutSnapshot(page.data.title, page.data.markdown));
      setVersion(page.data.version);
      setPublished(page.data.status === "published");
      setMessage(path === "/publish" ? "关于页已发布。" : "草稿已保存。");
    } catch {
      setMessage(actionCopy[action].failed);
    } finally {
      setPending(null);
    }
  }

  const titleError = errors.title?.join("；");
  const markdownError = errors.markdown?.join("；");
  return (
    <main className={`${styles.workspace} ${styles.adminEditorPage}`} aria-busy={Boolean(pending)}>
      <header className={styles.workspaceHeader}>
        <div><p className={styles.eyebrow}>BLOG X / 站点信息</p><h1>关于页</h1><p className={styles.headerDescription}>编辑访客在公开关于页看到的站点介绍。</p></div>
        <a className={styles.secondaryLink} href="/about">查看公开关于页</a>
      </header>
      <p className={styles.contentStatus}>
        当前状态 <strong>{published ? "已发布" : "草稿"}</strong>
        <span aria-hidden="true">·</span>
        <strong>{dirty ? "有未保存更改" : version ? "内容已保存" : "尚未创建"}</strong>
      </p>
      <section className={styles.metadata} aria-label="关于页元数据">
        <label>
          标题
          <input
            value={title}
            disabled={Boolean(pending)}
            onChange={(event) => { setTitle(event.target.value); clearError("title"); }}
            aria-invalid={Boolean(titleError)}
            aria-describedby={titleError ? "about-title-error" : undefined}
          />
        </label>
        {titleError ? <p id="about-title-error" className={styles.error}>{titleError}</p> : null}
      </section>
      <div className={styles.mobileTabs} aria-label="关于页编辑器视图">
        <button type="button" disabled={Boolean(pending)} aria-pressed={pane === "edit"} onClick={() => setPane("edit")}>编辑</button>
        <button type="button" disabled={Boolean(pending)} aria-pressed={pane === "preview"} onClick={() => setPane("preview")}>预览</button>
      </div>
      <section className={styles.editor}>
        <div className={`${styles.pane} ${pane === "preview" ? styles.mobileInactive : styles.mobileActive}`} data-testid="about-editor-source">
          <div className={styles.paneHeader}>Markdown 源码</div>
          <label className={styles.markdownLabel}>
            Markdown
            <textarea
              value={markdown}
              disabled={Boolean(pending)}
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
      <div className={`${styles.actionButtons} ${styles.editorActions}`}>
        <button type="button" disabled={Boolean(pending)} onClick={() => { void request(""); }}>
          {pending === "save" ? "正在保存…" : "保存草稿"}
        </button>
        <button type="button" disabled={Boolean(pending)} onClick={() => { void request("/preview"); }}>
          {pending === "preview" ? "正在生成…" : "更新预览"}
        </button>
        <button type="button" disabled={Boolean(pending) || !version || dirty} title={dirty ? "请先保存当前更改" : undefined} onClick={() => { void request("/publish"); }}>
          {pending === "publish" ? "正在发布…" : "发布"}
        </button>
      </div>
      <p className={styles.status} role="status" aria-label="关于页编辑状态">{message}</p>
    </main>
  );
}
