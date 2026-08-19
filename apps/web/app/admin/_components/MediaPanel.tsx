"use client";

import { mediaUploadResponseSchema, type MediaReference } from "@blog-x/contracts";
import { useMemo, useRef, useState } from "react";
import styles from "../admin.module.css";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maximumBytes = 5 * 1024 * 1024;

export default function MediaPanel({
  currentCover,
  onInsert,
  onCover,
}: {
  currentCover: MediaReference | null;
  onInsert: (media: MediaReference) => void;
  onCover: (media: MediaReference) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [decorative, setDecorative] = useState(false);
  const [uploaded, setUploaded] = useState<MediaReference | null>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const media = useMemo(() => uploaded ? {
    ...uploaded,
    alt: decorative ? "" : alt.trim(),
    decorative,
  } : null, [uploaded, alt, decorative]);

  function validateUsage() {
    if (!decorative && !alt.trim()) {
      setStatus("请填写图片替代文本，或明确标记为装饰图片。");
      return false;
    }
    return true;
  }

  async function upload() {
    if (!file || file.size > maximumBytes || !acceptedTypes.has(file.type)) {
      setStatus("图片未上传：请选择不超过 5 MiB 的 JPEG、PNG 或 WebP 图片。");
      return;
    }
    setPending(true);
    setStatus("图片上传中…");
    try {
      const form = new FormData();
      form.append("alt", decorative ? "" : alt.trim());
      form.append("decorative", String(decorative));
      form.append("file", file);
      const response = await fetch("/api/admin/media", { method: "POST", body: form, credentials: "same-origin" });
      if (!response.ok) {
        setStatus(response.status === 400 || response.status === 413
          ? "图片未上传：请选择不超过 5 MiB 的 JPEG、PNG 或 WebP 图片。"
          : "图片暂时无法处理，请检查文件后重试。");
        return;
      }
      const parsed = mediaUploadResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("invalid media response");
      setUploaded(parsed.data);
      setStatus("图片已上传，可插入文章。");
      window.requestAnimationFrame(() => statusRef.current?.focus());
    } catch {
      setStatus("图片暂时无法处理，请检查文件后重试。");
    } finally {
      setPending(false);
    }
  }

  function useMedia(action: (reference: MediaReference) => void) {
    if (!media || !validateUsage()) return;
    action(media);
    setStatus(action === onCover ? "图片已设为封面。" : "图片已插入 Markdown。");
  }

  return (
    <section className={styles.mediaPanel} aria-labelledby="media-panel-title">
      <div>
        <p className={styles.eyebrow}>媒体</p>
        <h2 id="media-panel-title">文章图片</h2>
      </div>
      <label className={styles.mediaField}>
        上传图片（JPEG、PNG 或 WebP，最大 5 MiB）
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setUploaded(null);
            setStatus("");
          }}
        />
      </label>
      {file ? <p className={styles.mediaFilename}>已选择：{file.name}</p> : null}
      <label className={styles.mediaField}>
        图片替代文本
        <input
          data-testid="media-alt-text"
          value={alt}
          disabled={decorative || pending}
          onChange={(event) => setAlt(event.target.value)}
        />
      </label>
      <label className={styles.decorativeToggle}>
        <input
          type="checkbox"
          checked={decorative}
          disabled={pending}
          onChange={(event) => {
            setDecorative(event.target.checked);
            if (event.target.checked) setAlt("");
          }}
        />
        这是装饰图片
      </label>
      <div className={styles.mediaActions}>
        <button type="button" disabled={pending || !file} onClick={() => { void upload(); }}>上传图片</button>
        <button type="button" disabled={pending || !media} onClick={() => useMedia(onInsert)}>插入 Markdown</button>
        <button type="button" disabled={pending || !media} onClick={() => useMedia(onCover)}>设为封面</button>
      </div>
      {media ? (
        <figure className={styles.mediaPreview}>
          <img src={media.url} width={media.width} height={media.height} alt={media.decorative ? "" : media.alt} />
          <figcaption>{media.width} × {media.height} · {media.mimeType}</figcaption>
        </figure>
      ) : null}
      {currentCover ? <p className={styles.mediaFilename}>当前封面：{currentCover.url}</p> : null}
      <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className={styles.status}>{status}</p>
    </section>
  );
}
