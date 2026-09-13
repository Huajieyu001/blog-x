import { cookies } from "next/headers";
import { getAdminTaxonomyResult } from "../../lib/api";
import TaxonomyManager from "../_components/TaxonomyManager";
import styles from "../admin.module.css";

export default async function TaxonomyPage() {
  const cookie = (await cookies()).toString();
  const [categories, tags] = await Promise.all([
    getAdminTaxonomyResult("categories", cookie),
    getAdminTaxonomyResult("tags", cookie),
  ]);
  return (
    <main className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div><p className={styles.eyebrow}>BLOG X / 内容组织</p><h1>分类与标签</h1><p>用分类建立文章主线，用标签补充更灵活的主题关联。</p></div>
        <a className={styles.secondaryLink} href="/admin#articles">返回文章管理</a>
      </header>
      <div className={styles.taxonomyGrid}>
        {categories.kind === "ok" ? <TaxonomyManager kind="categories" initialTerms={categories.data} /> : <TaxonomyFailure label="分类" />}
        {tags.kind === "ok" ? <TaxonomyManager kind="tags" initialTerms={tags.data} /> : <TaxonomyFailure label="标签" />}
      </div>
    </main>
  );
}

function TaxonomyFailure({ label }: { label: "分类" | "标签" }) {
  return (
    <section className={`${styles.taxonomyPanel} ${styles.errorPanel}`} role="alert">
      <p className={styles.eyebrow}>{label === "分类" ? "categories" : "tags"}</p>
      <h2>{label}暂时不可用</h2>
      <p>现有{label}没有改变，请检查连接后重新加载。</p>
      <a href="/admin/taxonomy">重新加载{label}</a>
    </section>
  );
}
