import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleBody from "../../_components/ArticleBody";
import ArticleToc from "../../_components/ArticleToc";
import PostCard from "../../_components/PostCard";
import ViewBeacon from "./ViewBeacon";
import { getPublicPost, getPublicRelatedPosts } from "../../lib/api";
import { buildBlogPosting, pageMetadata, serializeJsonLd } from "../../lib/site-metadata";
import styles from "../../public.module.css";

export default async function PublicArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getPublicPost(slug);
  if (result.kind === "not_found") notFound();
  if (result.kind === "upstream_error") throw new Error("public content unavailable");
  const article = result.data;
  const jsonLd = serializeJsonLd(buildBlogPosting({
    title: article.title,
    summary: article.summary,
    slug: article.slug,
    publishedAt: article.publishedAt,
  }));
  const relatedResult = await getPublicRelatedPosts(slug);
  const seenSlugs = new Set([article.slug]);
  const relatedItems = relatedResult.kind === "ok"
    ? relatedResult.data.items.filter((item) => {
      if (seenSlugs.has(item.slug)) return false;
      seenSlugs.add(item.slug);
      return true;
    })
    : [];
  return (
    <main className={styles.page}>
      <ViewBeacon slug={article.slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <article className={styles.articleShell} aria-labelledby="article-title">
        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>Published note</p>
          {article.category || article.tags.length > 0 ? (
            <div className={styles.articleTaxonomy} aria-label="文章分类与标签">
              {article.category ? <Link href={`/categories/${encodeURIComponent(article.category.slug)}`}>{article.category.name}</Link> : null}
              {article.tags.map((tag) => <Link href={`/tags/${encodeURIComponent(tag.slug)}`} key={tag.slug}>#{tag.name}</Link>)}
            </div>
          ) : null}
          <h1 id="article-title">{article.title}</h1>
          <p className={`${styles.articleSummary} articleSummary`}>{article.summary}</p>
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
        {relatedResult.kind === "ok" && relatedItems.length > 0 ? (
          <section className={styles.relatedSection} data-testid="related-reading" aria-labelledby="related-heading">
            <h2 id="related-heading">继续阅读</h2>
            <div className={styles.relatedGrid}>
              {relatedItems.map((post) => <PostCard key={post.slug} post={post} variant="compact" />)}
            </div>
          </section>
        ) : null}
        {relatedResult.kind !== "ok" ? (
          <aside className={styles.relatedRecovery} data-testid="related-recovery" aria-labelledby="related-recovery-heading">
            <h2 id="related-recovery-heading">相关文章暂时不可用</h2>
            <p>文章内容不受影响，你可以继续阅读或返回最新文章。</p>
            <Link href="/">返回最新文章</Link>
          </aside>
        ) : null}
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
