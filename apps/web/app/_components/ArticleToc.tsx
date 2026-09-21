"use client";

import type { TocEntry } from "@blog-x/contracts";
import { useEffect, useState } from "react";
import styles from "../public.module.css";

function currentSectionId(entries: TocEntry[]) {
  const threshold = window.innerHeight * 0.35;
  let currentId: string | null = null;
  for (const entry of entries) {
    const heading = document.getElementById(entry.id);
    if (heading && heading.getBoundingClientRect().top <= threshold) currentId = entry.id;
  }
  return currentId;
}

function TocLinks({ entries, currentId }: { entries: TocEntry[]; currentId: string | null }) {
  return (
    <ol className={styles.tocList}>
      {entries.map((entry) => (
        <li className={entry.depth === 3 ? styles.tocDepthThree : undefined} key={entry.id}>
          <a data-testid="toc-link" href={`#${entry.id}`} aria-current={entry.id === currentId ? "location" : undefined}>{entry.text || "未命名章节"}</a>
        </li>
      ))}
    </ol>
  );
}

export default function ArticleToc({ entries }: { entries: TocEntry[] }) {
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setCurrentId(currentSectionId(entries));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <>
      <nav className={styles.articleTocDesktop} data-testid="article-toc" aria-label="文章目录">
        <p className={styles.tocTitle}>文章目录</p>
        <TocLinks entries={entries} currentId={currentId} />
      </nav>
      <details className={styles.articleTocNarrow} data-testid="article-toc">
        <summary>文章目录</summary>
        <nav aria-label="文章目录">
          <TocLinks entries={entries} currentId={currentId} />
        </nav>
      </details>
    </>
  );
}
