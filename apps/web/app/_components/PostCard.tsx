import type { PublicPostListItem } from "@blog-x/contracts";
import styles from "../public.module.css";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
});

export default function PostCard({ post, position }: { post: PublicPostListItem; position: number }) {
  return (
    <article className={styles.postCard} data-testid="post-card">
      <p className={styles.index} aria-hidden="true">{String(position).padStart(2, "0")}</p>
      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>
          <span className={styles.status}><span aria-hidden="true" />已发布</span>
          <time dateTime={post.publishedAt}>{dateFormatter.format(new Date(post.publishedAt))}</time>
        </div>
        <h3><a href={`/posts/${encodeURIComponent(post.slug)}`}>{post.title}</a></h3>
        <p className={styles.summary}>{post.summary || "暂无摘要"}</p>
        {post.category || post.tags.length ? <div className={styles.taxonomy} aria-label="文章分类和标签">
          {post.category ? <a href={`/categories/${encodeURIComponent(post.category.slug)}`}>分类：{post.category.name}</a> : null}
          {post.tags.map((tag) => <a key={tag.slug} href={`/tags/${encodeURIComponent(tag.slug)}`}>#{tag.name}</a>)}
        </div> : null}
        <a className={styles.readLink} href={`/posts/${encodeURIComponent(post.slug)}`} aria-label={`阅读《${post.title}》`}>
          阅读文章 <span aria-hidden="true">→</span>
        </a>
      </div>
    </article>
  );
}
