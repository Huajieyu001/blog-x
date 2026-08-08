import { publicPostDetailSchema, type PublicPostDetail } from "@blog-x/contracts";
import { notFound } from "next/navigation";
import ArticleBody from "../../_components/ArticleBody";
import ArticleToc from "../../_components/ArticleToc";
import styles from "../../public.module.css";

const apiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";

async function getPublicPost(slug: string): Promise<PublicPostDetail | null> {
  try {
    const response = await fetch(`${apiOrigin}/public/articles/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const parsed = publicPostDetailSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default async function PublicArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = await getPublicPost((await params).slug);
  if (!article) notFound();
  return (
    <main className={styles.page}>
      <header className={styles.siteHeader}>
        <a className={styles.brand} href="/">Blog X</a>
        <nav aria-label="站点导航"><a href="/">所有文章</a><a href="/admin">管理</a></nav>
      </header>
      <article className={styles.articleShell}>
        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>Published note</p>
          {article.category || article.tags.length > 0 ? (
            <div className={styles.articleTaxonomy} aria-label="文章分类与标签">
              {article.category ? <a href={`/categories/${encodeURIComponent(article.category.slug)}`}>{article.category.name}</a> : null}
              {article.tags.map((tag) => <a href={`/tags/${encodeURIComponent(tag.slug)}`} key={tag.slug}>#{tag.name}</a>)}
            </div>
          ) : null}
          <h1>{article.title}</h1>
          <p className={styles.articleSummary}>{article.summary}</p>
          <time dateTime={article.publishedAt}>
            {new Intl.DateTimeFormat("zh-CN", { dateStyle: "long", timeZone: "Asia/Shanghai" }).format(new Date(article.publishedAt))}
          </time>
        </header>
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
