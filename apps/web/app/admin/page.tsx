import { cookies } from "next/headers";
import { getAdminPosts } from "../lib/api";
import ArticleActions from "./_components/ArticleActions";
import styles from "./admin.module.css";

export default async function AdminPage() {
  const posts = await getAdminPosts((await cookies()).toString());
  return (
    <section className={styles.management} aria-labelledby="management-title">
      <div className={styles.managementTitle}><h1 id="management-title">文章管理</h1><a href="/admin/new">新建草稿</a></div>
      <div className={styles.postList}>
        {posts.length ? posts.map((post) => <ArticleActions key={post.id} post={post} variant="list" />) : <p>还没有文章，先创建一篇草稿。</p>}
      </div>
    </section>
  );
}
