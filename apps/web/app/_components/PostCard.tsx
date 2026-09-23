import type { PublicPostListItem } from "@blog-x/contracts";
import Link from "next/link";
import styles from "../public.module.css";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
});

type PostCardProps = {
  post: PublicPostListItem;
  position?: number;
  variant?: "default" | "compact";
  priority?: boolean;
};

export default function PostCard({ post, position = 1, variant = "default", priority = false }: PostCardProps) {
  const compact = variant === "compact";
  const articleClass = compact
    ? `${styles.compactPostCard} ${post.cover ? styles.compactPostCardWithCover : ""}`
    : `${styles.postCard} ${post.cover ? styles.postCardWithCover : ""}`;
  return (
    <article className={articleClass} data-testid="post-card">
      {!compact ? <p className={styles.index} aria-hidden="true">{String(position).padStart(2, "0")}</p> : null}
      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>
          {!compact ? <span className={styles.status}><span aria-hidden="true" />已发布</span> : null}
          <time dateTime={post.publishedAt}>{dateFormatter.format(new Date(post.publishedAt))}</time>
        </div>
        <h3><Link href={`/posts/${encodeURIComponent(post.slug)}`} prefetch={false}>{post.title}</Link></h3>
        <p className={styles.summary}>{post.summary || "暂无摘要"}</p>
        {post.category || post.tags.length ? <div className={styles.taxonomy} aria-label="文章分类和标签">
          {post.category ? <Link href={`/categories/${encodeURIComponent(post.category.slug)}`} prefetch={false}>分类：{post.category.name}</Link> : null}
          {post.tags.map((tag) => <Link key={tag.slug} href={`/tags/${encodeURIComponent(tag.slug)}`} prefetch={false}>#{tag.name}</Link>)}
        </div> : null}
        <Link className={styles.readLink} href={`/posts/${encodeURIComponent(post.slug)}`} prefetch={false} aria-label={`阅读《${post.title}》`}>
          阅读文章 <span aria-hidden="true">→</span>
        </Link>
      </div>
      {post.cover ? (
        <Link
          className={styles.cardCover}
          href={`/posts/${encodeURIComponent(post.slug)}`}
          prefetch={false}
          aria-hidden="true"
          tabIndex={-1}
        >
          <img
            src={post.cover.url}
            width={post.cover.width}
            height={post.cover.height}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : undefined}
          />
        </Link>
      ) : null}
    </article>
  );
}
