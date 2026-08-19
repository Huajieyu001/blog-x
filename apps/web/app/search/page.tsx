import Link from "next/link";
import { headers } from "next/headers";
import SearchForm from "../_components/SearchForm";
import {
  loadSearchDiscovery,
  resolveSearchCanonical,
} from "../lib/search-discovery";
import { pageMetadata } from "../lib/site-metadata";
import { searchEncodingHeaderName } from "../../lib/search-encoding";
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

async function resolveOutcome(searchParams: SearchPageProps["searchParams"]) {
  const [parameters, requestHeaders] = await Promise.all([searchParams, headers()]);
  return loadSearchDiscovery(parameters, requestHeaders.get(searchEncodingHeaderName));
}

export async function generateMetadata({ searchParams }: SearchPageProps) {
  const outcome = await resolveOutcome(searchParams);
  return pageMetadata({
    title: "搜索文章",
    description: "搜索已发布文章。",
    path: "/search",
    canonicalPath: resolveSearchCanonical(outcome) ?? null,
    index: false,
  });
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const outcome = await resolveOutcome(searchParams);
  const query = "query" in outcome ? outcome.query : "";

  return (
    <main className={`${styles.page} ${styles.searchPage}`}>
      <header className={styles.discoveryHeader}>
        <p className={styles.eyebrow}>Discovery</p>
        <h1>搜索文章</h1>
        <p>从已发布文章的标题、摘要和正文中查找内容。</p>
      </header>
      <SearchForm defaultValue={query} />

      {outcome.kind === "invalid" ? (
        <StatePanel heading="搜索条件无效" body="请使用不超过 80 个字符的搜索内容和有效页码后重试。" />
      ) : outcome.kind === "upstream_error" ? (
        <StatePanel heading="暂时无法完成搜索" body="搜索服务似乎暂时不可用，请重试或返回最新文章。" />
      ) : outcome.kind === "empty_query" ? (
        <StatePanel heading="请输入搜索内容" body="输入标题、摘要或正文中的关键词，即可搜索已发布文章。" />
      ) : outcome.kind === "no_results" ? (
        <StatePanel heading="没有找到匹配文章" body="试试更短的关键词，或返回最新文章继续浏览。" />
      ) : outcome.kind === "page_out_of_range" ? (
        <StatePanel heading="这一页没有结果" body={`“${outcome.query}” 共有 ${outcome.totalItems} 篇文章，请返回可用页码。`} />
      ) : (
        <section className={styles.searchResults} aria-labelledby="search-results-heading">
          <div className={styles.searchResultsHeader}>
            <h2 id="search-results-heading">“{outcome.query}” 的搜索结果</h2>
            <p>找到 {outcome.totalItems} 篇文章 · 第 {outcome.page} 页</p>
          </div>
          <div className={styles.compactPostList}>
            {outcome.items.map((post) => (
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
