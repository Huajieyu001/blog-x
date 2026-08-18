import Link from "next/link";
import SearchForm from "../_components/SearchForm";
import { getPublicSearch } from "../lib/api";
import styles from "../public.module.css";

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function StatePanel({ heading, body }: { heading: string; body: string }) {
  return (
    <section className={styles.searchState}>
      <h2>{heading}</h2>
      <p>{body}</p>
      <Link href="/">返回最新文章</Link>
    </section>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const parameters = await searchParams;
  const query = typeof parameters.q === "string" ? parameters.q.normalize("NFC").trim() : "";
  const requestedPage = typeof parameters.page === "string" && /^[1-9]\d*$/.test(parameters.page)
    ? Number(parameters.page)
    : 1;
  const outcome = await getPublicSearch(query, requestedPage);

  return (
    <main className={`${styles.page} ${styles.searchPage}`}>
      <header className={styles.discoveryHeader}>
        <p className={styles.eyebrow}>Discovery</p>
        <h1>搜索文章</h1>
        <p>从已发布文章的标题、摘要和正文中查找内容。</p>
      </header>
      <SearchForm defaultValue={query} />

      {outcome.kind !== "ok" ? (
        <StatePanel heading="暂时无法完成搜索" body="搜索服务似乎暂时不可用，请重试或返回最新文章。" />
      ) : outcome.data.state === "empty_query" ? (
        <StatePanel heading="请输入搜索内容" body="输入标题、摘要或正文中的关键词，即可搜索已发布文章。" />
      ) : outcome.data.state === "no_results" ? (
        <StatePanel heading="没有找到匹配文章" body="试试更短的关键词，或返回最新文章继续浏览。" />
      ) : outcome.data.state === "page_out_of_range" ? (
        <StatePanel heading="这一页没有结果" body={`“${outcome.data.query}” 共有 ${outcome.data.totalItems} 篇文章，请返回可用页码。`} />
      ) : (
        <section className={styles.searchResults} aria-labelledby="search-results-heading">
          <div className={styles.searchResultsHeader}>
            <h2 id="search-results-heading">“{outcome.data.query}” 的搜索结果</h2>
            <p>找到 {outcome.data.totalItems} 篇文章 · 第 {outcome.data.page} 页</p>
          </div>
          <div className={styles.compactPostList}>
            {outcome.data.items.map((post) => (
              <article className={styles.compactPostCard} data-testid="post-card" key={post.slug}>
                <div className={styles.cardMeta}>
                  <span className={styles.status}><span aria-hidden="true" />已发布</span>
                  <time dateTime={post.publishedAt}>{new Date(post.publishedAt).toLocaleDateString("zh-CN")}</time>
                </div>
                <h3><Link href={`/posts/${post.slug}`}>{post.title}</Link></h3>
                {post.summary ? <p className={styles.summary}>{post.summary}</p> : null}
                <div className={styles.taxonomy}>
                  {post.category ? <Link href={`/categories/${post.category.slug}`}>{post.category.name}</Link> : null}
                  {post.tags.map((tag) => <Link href={`/tags/${tag.slug}`} key={tag.slug}>#{tag.name}</Link>)}
                </div>
                <Link className={styles.readLink} href={`/posts/${post.slug}`}>阅读文章 <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
