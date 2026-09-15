"use client";

import type { AdminPost } from "@blog-x/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "../admin.module.css";
import ArticleActions from "./ArticleActions";

type PostFilter = "all" | AdminPost["status"] | "scheduled";

const filterLabels: Array<{ value: PostFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "published", label: "已发布" },
  { value: "draft", label: "草稿" },
  { value: "unpublished", label: "已下线" },
  { value: "scheduled", label: "已预约" },
];

export default function AdminPostList({ posts, initialFilter = "all" }: { posts: AdminPost[]; initialFilter?: PostFilter }) {
  const router = useRouter();
  const [records, setRecords] = useState(posts);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PostFilter>(initialFilter);

  useEffect(() => setRecords(posts), [posts]);
  useEffect(() => setFilter(initialFilter), [initialFilter]);

  const counts = useMemo(() => ({
    all: records.length,
    published: records.filter((post) => post.status === "published").length,
    draft: records.filter((post) => post.status === "draft").length,
    unpublished: records.filter((post) => post.status === "unpublished").length,
    scheduled: records.filter((post) => Boolean(post.scheduledAt)).length,
  }), [records]);

  const visiblePosts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return records.filter((post) => {
      const matchesFilter = filter === "all"
        || (filter === "scheduled" ? Boolean(post.scheduledAt) : post.status === filter);
      if (!matchesFilter) return false;
      if (!needle) return true;
      return [post.title, post.slug, post.summary ?? ""]
        .some((value) => value.toLocaleLowerCase("zh-CN").includes(needle));
    });
  }, [filter, query, records]);

  function selectFilter(nextFilter: PostFilter) {
    setFilter(nextFilter);
    router.replace(nextFilter === "all" ? "/admin#articles" : `/admin?status=${nextFilter}#articles`, { scroll: false });
  }

  function resetFilters() {
    setQuery("");
    selectFilter("all");
  }

  function updatePost(nextPost: AdminPost) {
    setRecords((current) => current.map((post) => post.id === nextPost.id ? nextPost : post));
  }

  function removePost(id: string) {
    setRecords((current) => current.filter((post) => post.id !== id));
  }

  if (!records.length) {
    return <p>还没有文章。新建第一篇草稿，开始记录。 <a href="/admin/new">创建第一篇草稿</a></p>;
  }

  return (
    <div>
      <div className={styles.postListToolbar}>
        <label className={styles.postSearch}>
          <span>搜索文章</span>
          <input
            type="search"
            value={query}
            placeholder="输入标题、Slug 或摘要"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.postFilters} role="group" aria-label="按文章状态筛选">
          {filterLabels.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => selectFilter(option.value)}
            >
              {option.label}<span>{counts[option.value]}</span>
            </button>
          ))}
        </div>
        <p className={styles.postResultCount} role="status" aria-live="polite">
          显示 {visiblePosts.length} / {records.length} 篇
        </p>
      </div>

      {visiblePosts.length ? (
        <div className={styles.postList}>
          {visiblePosts.map((post) => (
            <ArticleActions
              key={post.id}
              post={post}
              variant="list"
              onChanged={updatePost}
              onDeleted={() => removePost(post.id)}
            />
          ))}
        </div>
      ) : (
        <article className={styles.emptyPanel}>
          <h3>没有匹配的文章</h3>
          <p>换一个关键词或状态筛选条件试试。</p>
          <button type="button" onClick={resetFilters}>清除筛选</button>
        </article>
      )}
    </div>
  );
}
