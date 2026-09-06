import { cookies } from "next/headers";
import TaxonomyManager from "../_components/TaxonomyManager";
import styles from "../admin.module.css";

const api = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";

async function terms(kind: "categories" | "tags", cookie: string) {
  try {
    const response = await fetch(`${api}/admin/${kind}`, { cache: "no-store", headers: { cookie } });
    if (!response.ok) return [];
    return ((await response.json()) as { items: Array<{ id: string; name: string; slug: string; articleCount: number }> }).items;
  } catch {
    return [];
  }
}

export default async function TaxonomyPage() {
  const cookie = (await cookies()).toString();
  const [categories, tags] = await Promise.all([terms("categories", cookie), terms("tags", cookie)]);
  return (
    <main className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div><p className={styles.eyebrow}>BLOG X / 内容组织</p><h1>分类与标签</h1><p>用分类建立文章主线，用标签补充更灵活的主题关联。</p></div>
        <a className={styles.secondaryLink} href="/admin#articles">返回文章管理</a>
      </header>
      <div className={styles.taxonomyGrid}>
        <TaxonomyManager kind="categories" initialTerms={categories} />
        <TaxonomyManager kind="tags" initialTerms={tags} />
      </div>
    </main>
  );
}
