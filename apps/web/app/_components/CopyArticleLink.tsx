"use client";

import { useState } from "react";
import styles from "../public.module.css";

type CopyArticleLinkProps = {
  canonicalUrl: string;
};

function copyWithFallback(canonicalUrl: string) {
  const fallback = document.createElement("textarea");
  fallback.value = canonicalUrl;
  fallback.readOnly = true;
  fallback.tabIndex = -1;
  fallback.setAttribute("aria-hidden", "true");
  fallback.setAttribute("data-copy-article-link-fallback", "");
  fallback.style.cssText = "position:fixed;left:-10000px;top:auto;width:1px;height:1px;opacity:0";
  document.body.append(fallback);

  try {
    fallback.select();
    return document.execCommand("copy") === true;
  } finally {
    fallback.remove();
  }
}

export default function CopyArticleLink({ canonicalUrl }: CopyArticleLinkProps) {
  const [status, setStatus] = useState("");

  async function copyArticleLink() {
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(canonicalUrl);
        copied = true;
      }
    } catch {
      // Clipboard permission can be unavailable; use the local fallback below.
    }

    if (!copied) {
      try {
        copied = copyWithFallback(canonicalUrl);
      } catch {
        copied = false;
      }
    }

    setStatus(copied ? "文章链接已复制。" : "复制失败，请手动复制浏览器地址栏中的链接。");
  }

  return (
    <div className={styles.copyArticleLink}>
      <button className={styles.copyArticleButton} type="button" onClick={copyArticleLink}>
        复制文章链接
      </button>
      <p className={styles.copyArticleStatus} role="status" aria-label="复制文章链接状态" aria-atomic="true">
        {status}
      </p>
    </div>
  );
}
