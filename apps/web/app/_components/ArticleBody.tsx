import styles from "../public.module.css";

export default function ArticleBody({ renderedHtml }: { renderedHtml: string }) {
  return (
    <div
      className={styles.articleBody}
      data-testid="article-body"
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
