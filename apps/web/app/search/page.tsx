import Link from "next/link";
import { headers } from "next/headers";
import Pagination from "../_components/Pagination";
import PostCard from "../_components/PostCard";
import SearchForm from "../_components/SearchForm";
import {
  loadSearchDiscovery,
  resolveSearchCanonical,
  searchHref,
} from "../lib/search-discovery";
import { pageMetadata } from "../lib/site-metadata";
import { searchEncodingHeaderName } from "../../lib/search-encoding";
import styles from "../public.module.css";

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type StateAction = { href: string; label: string };

function StatePanel({ heading, body, actions }: { heading: string; body: string; actions: StateAction[] }) {
  return (
    <section className={styles.searchState}>
      <h2>{heading}</h2>
      <p>{body}</p>
      <div className={styles.searchActions}>
        {actions.map((action) => <Link href={action.href} key={`${action.href}-${action.label}`}>{action.label}</Link>)}
      </div>
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
        <StatePanel
          heading="搜索条件无效"
          body="请使用不超过 80 个字符的搜索内容和有效页码后重试。"
          actions={[{ href: "/search", label: "清除搜索" }, { href: "/", label: "返回最新文章" }]}
        />
      ) : outcome.kind === "upstream_error" ? (
        <StatePanel
          heading="暂时无法完成搜索"
          body="搜索服务似乎暂时不可用，请重试或返回最新文章。"
          actions={[{ href: searchHref(outcome.query, outcome.page), label: "重试" }, { href: "/", label: "返回最新文章" }]}
        />
      ) : outcome.kind === "empty_query" ? (
        <StatePanel
          heading="请输入搜索内容"
          body="输入标题、摘要或正文中的关键词，即可搜索已发布文章。"
          actions={[{ href: "/", label: "返回最新文章" }]}
        />
      ) : outcome.kind === "no_results" ? (
        <StatePanel
          heading="没有找到匹配文章"
          body="试试更短的关键词，或返回最新文章继续浏览。"
          actions={[{ href: "/search", label: "清除搜索" }, { href: "/", label: "返回最新文章" }]}
        />
      ) : outcome.kind === "page_out_of_range" ? (
        <StatePanel
          heading="这一页没有结果"
          body={`“${outcome.query}” 共有 ${outcome.totalItems} 篇文章，请返回可用页码。`}
          actions={[{ href: searchHref(outcome.query, 1), label: "返回第 1 页" }, { href: "/search", label: "清除搜索" }]}
        />
      ) : (
        <section className={styles.searchResults} aria-labelledby="search-results-heading">
          <div className={styles.searchResultsHeader}>
            <h2 id="search-results-heading">“{outcome.query}” 的搜索结果</h2>
            <p>找到 {outcome.totalItems} 篇文章 · 第 {outcome.page} 页</p>
          </div>
          <div className={styles.compactPostList}>
            {outcome.items.map((post) => (
              <PostCard key={post.slug} post={post} variant="compact" />
            ))}
          </div>
          <Pagination
            page={outcome.page}
            totalPages={outcome.totalPages}
            ariaLabel="搜索结果分页"
            hrefForPage={(page) => searchHref(outcome.query, page)}
          />
          <div className={styles.searchActions}>
            <Link href="/search">清除搜索</Link>
            <Link href="/">返回最新文章</Link>
          </div>
        </section>
      )}
    </main>
  );
}
