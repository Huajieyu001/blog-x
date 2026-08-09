import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleBody from "../../_components/ArticleBody";
import ArticleToc from "../../_components/ArticleToc";
import { getPublicPost } from "../../lib/api";
import { pageMetadata } from "../../lib/site-metadata";
import styles from "../../public.module.css";

export default async function PublicArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const result = await getPublicPost((await params).slug);
  if (result.kind === "not_found") notFound();
  if (result.kind === "upstream_error") throw new Error("public content unavailable");
  const article = result.data;
  return (
    <main className={styles.page}>
      <article className={styles.articleShell}>
        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>Published note</p>
          {article.category || article.tags.length > 0 ? (
            <div className={styles.articleTaxonomy} aria-label="文章分类与标签">
              {article.category ? <Link href={`/categories/${encodeURIComponent(article.category.slug)}`}>{article.category.name}</Link> : null}
              {article.tags.map((tag) => <Link href={`/tags/${encodeURIComponent(tag.slug)}`} key={tag.slug}>#{tag.name}</Link>)}
            </div>
          ) : null}
          <h1>{article.title}</h1>
          <p className={styles.articleSummary}>{article.summary}</p>
          <time dateTime={article.publishedAt}>
            {new Intl.DateTimeFormat("zh-CN", { dateStyle: "long", timeZone: "Asia/Shanghai" }).format(new Date(article.publishedAt))}
          </time>
        </header>
        {article.cover ? (
          <img
            className={styles.articleCover}
            src={article.cover.url}
            width={article.cover.width}
            height={article.cover.height}
            alt={article.cover.decorative ? "" : article.cover.alt}
          />
        ) : null}
        <div
          className={`${styles.articleContent} ${article.toc.length > 0 ? styles.articleContentWithToc : styles.articleContentSingle}`}
          data-testid="article-content"
        >
          <ArticleToc entries={article.toc} />
          <ArticleBody renderedHtml={article.renderedHtml} />
        </div>
      </article>
    </main>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicPost(slug);
  if (result.kind === "not_found") notFound();
  if (result.kind === "upstream_error") throw new Error("public content unavailable");
  const article = result.data;
  return pageMetadata({
    title: article.title,
    description: article.seoDescription || article.summary || "记录代码、系统与长期实践。",
    path: `/posts/${encodeURIComponent(article.slug)}`,
    type: "article",
  });
}
