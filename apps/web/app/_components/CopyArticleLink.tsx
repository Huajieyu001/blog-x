"use client";

import { useState } from "react";
import { copyText } from "./clipboard";
import styles from "../public.module.css";

type CopyArticleLinkProps = {
  canonicalUrl: string;
};

export default function CopyArticleLink({ canonicalUrl }: CopyArticleLinkProps) {
  const [status, setStatus] = useState("");

  async function copyArticleLink() {
    const copied = await copyText(canonicalUrl);
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
