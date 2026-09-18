"use client";

import { mediaUploadResponseSchema, type MediaReference } from "@blog-x/contracts";
import { useMemo, useRef, useState } from "react";
import styles from "../admin.module.css";
import MediaLibrary from "./MediaLibrary";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maximumBytes = 5 * 1024 * 1024;
type StatusKind = "idle" | "progress" | "success" | "error";

function validateFile(file: File | null) {
  if (!file) return "";
  if (!acceptedTypes.has(file.type)) return "图片未选择：仅支持 JPEG、PNG 或 WebP 格式。";
  if (file.size > maximumBytes) return "图片未选择：文件不能超过 5 MiB。";
  if (file.size === 0) return "图片未选择：文件内容为空，请重新选择。";
  return "";
}

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
  const [statusKind, setStatusKind] = useState<StatusKind>("idle");
  const [uploadFailed, setUploadFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const selectionVersionRef = useRef(0);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const fileError = validateFile(file);
  const media = useMemo(() => uploaded ? {
    ...uploaded,
    alt: decorative ? "" : alt.trim(),
    decorative,
  } : null, [uploaded, alt, decorative]);

  function announce(message: string, kind: StatusKind, focus = false) {
    setStatus(message);
    setStatusKind(kind);
    if (focus) window.requestAnimationFrame(() => statusRef.current?.focus());
  }

  function validateUsage() {
    if (!decorative && !alt.trim()) {
      announce("请填写图片替代文本，或明确标记为装饰图片。", "error", true);
      return false;
    }
    return true;
  }

  async function upload() {
    if (pendingRef.current) return;
    const selectedFile = file;
    const validationError = validateFile(selectedFile);
    if (!selectedFile || validationError) {
      announce(validationError || "请先选择要上传的图片。", "error", true);
      return;
    }
    const selectionVersion = selectionVersionRef.current;
    pendingRef.current = true;
    setPending(true);
    setUploadFailed(false);
    announce("图片上传中…", "progress");
    try {
      const form = new FormData();
      form.append("alt", decorative ? "" : alt.trim());
      form.append("decorative", String(decorative));
      form.append("file", selectedFile);
      const response = await fetch("/api/admin/media", { method: "POST", body: form, credentials: "same-origin" });
      const body = await response.json().catch(() => null);
      if (selectionVersionRef.current !== selectionVersion) return;
      if (!response.ok) {
        const message = response.status === 400 || response.status === 413
          ? "图片未上传：文件格式或大小不符合要求，请重新选择。"
          : response.status === 401
            ? "登录状态已失效，请重新登录后再上传。"
            : response.status === 429
              ? "上传请求过于频繁，请稍后重试。"
              : "图片暂时无法处理，所选文件仍然保留，可直接重试。";
        setUploadFailed(response.status !== 400 && response.status !== 413);
        announce(message, "error", true);
        return;
      }
      const parsed = mediaUploadResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error("invalid media response");
      setUploaded(parsed.data);
      announce("图片已上传，可插入文章或设为封面。", "success", true);
    } catch {
      if (selectionVersionRef.current === selectionVersion) {
        setUploadFailed(true);
        announce("图片暂时无法处理，所选文件仍然保留，可直接重试。", "error", true);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function useMedia(action: (reference: MediaReference) => void) {
    if (!media || !validateUsage()) return;
    action(media);
    announce(action === onCover ? "图片已设为封面。" : "图片已插入 Markdown。", "success");
  }

  function selectExisting(reference: MediaReference) {
    setUploaded(reference);
    setAlt("");
    setDecorative(false);
    setFile(null);
    setUploadFailed(false);
    announce("已选择已有图片；请为这次使用填写替代文本，或标记为装饰图片。", "success", true);
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
          aria-invalid={Boolean(fileError)}
          aria-describedby={status ? "media-upload-status" : undefined}
          onChange={(event) => {
            const selectedFile = event.target.files?.[0] ?? null;
            selectionVersionRef.current += 1;
            setFile(selectedFile);
            setUploaded(null);
            setUploadFailed(false);
            const validationError = validateFile(selectedFile);
            if (validationError) {
              announce(validationError, "error", true);
            } else if (selectedFile) {
              announce(`已选择 ${selectedFile.name}，可以上传。`, "idle");
            } else {
              announce("", "idle");
            }
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
        <button type="button" disabled={pending || !file || Boolean(fileError)} onClick={() => { void upload(); }}>
          {pending ? "上传中…" : uploadFailed ? "重试上传" : "上传图片"}
        </button>
        <button type="button" disabled={pending || !media} onClick={() => useMedia(onInsert)}>插入 Markdown</button>
        <button type="button" disabled={pending || !media} onClick={() => useMedia(onCover)}>设为封面</button>
      </div>
      {media ? (
        <figure className={styles.mediaPreview}>
          <img src={media.url} width={media.width} height={media.height} alt={media.decorative ? "" : media.alt} />
          <figcaption>{media.width} × {media.height} · {media.mimeType}</figcaption>
        </figure>
      ) : null}
      <MediaLibrary onSelect={selectExisting} />
      {currentCover ? <p className={styles.mediaFilename}>当前封面：{currentCover.url}</p> : null}
      <p
        id="media-upload-status"
        ref={statusRef}
        tabIndex={-1}
        role={statusKind === "error" ? "alert" : "status"}
        aria-live={statusKind === "error" ? "assertive" : "polite"}
        className={styles.status}
      >
        {status}
      </p>
    </section>
  );
}
