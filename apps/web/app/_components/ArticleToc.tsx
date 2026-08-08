import type { TocEntry } from "@blog-x/contracts";
import styles from "../public.module.css";

function TocLinks({ entries }: { entries: TocEntry[] }) {
  return (
    <ol className={styles.tocList}>
      {entries.map((entry) => (
        <li className={entry.depth === 3 ? styles.tocDepthThree : undefined} key={entry.id}>
          <a data-testid="toc-link" href={`#${entry.id}`}>{entry.text || "未命名章节"}</a>
        </li>
      ))}
    </ol>
  );
}

export default function ArticleToc({ entries }: { entries: TocEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <>
      <nav className={styles.articleTocDesktop} data-testid="article-toc" aria-label="文章目录">
        <p className={styles.tocTitle}>文章目录</p>
        <TocLinks entries={entries} />
      </nav>
      <details className={styles.articleTocNarrow} data-testid="article-toc">
        <summary>文章目录</summary>
        <nav aria-label="文章目录">
          <TocLinks entries={entries} />
        </nav>
      </details>
    </>
  );
}
