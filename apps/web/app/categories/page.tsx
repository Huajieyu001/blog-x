import Link from "next/link";
import { getPublicTaxonomy } from "../lib/api";
import { pageMetadata } from "../lib/site-metadata";
import styles from "../public.module.css";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ title: "分类", description: "浏览公开文章分类。", path: "/categories" });

export default async function CategoriesPage() {
  const result = await getPublicTaxonomy("categories");
  if (result.kind !== "ok") throw new Error("public content unavailable");
  return (
    <main className={styles.page}>
      <section className={styles.feed}>
        <header className={styles.feedHeader}><h1>分类</h1><p>公开文章分类</p></header>
        {result.data.items.length ? (
          <div className={styles.termGrid}>
            {result.data.items.map((term) => (
              <article className={styles.termCard} key={term.slug}>
                <h2><Link href={`/categories/${encodeURIComponent(term.slug)}`}>{term.name}</Link></h2>
                <p>{term.articleCount} 篇已发布文章</p>
              </article>
            ))}
          </div>
        ) : <div className={styles.empty}><h2>暂时没有可公开浏览的分类或标签</h2><p>发布文章后，内容组织会显示在这里。</p></div>}
      </section>
    </main>
  );
}
