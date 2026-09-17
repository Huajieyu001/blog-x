import { cookies } from "next/headers";
import { getAdminDeletedPostsResult } from "../../lib/api";
import DeletedPostList from "../_components/DeletedPostList";
import styles from "../admin.module.css";

export default async function TrashPage() {
  const result = await getAdminDeletedPostsResult((await cookies()).toString());
  return <main className={styles.workspace} aria-labelledby="trash-title"><header className={styles.workspaceHeader}><div><p className={styles.eyebrow}>BLOG X / 内容恢复</p><h1 id="trash-title">回收站</h1><p>恢复后的文章仍为未公开草稿。</p></div><a className={styles.secondaryLink} href="/admin">返回工作台</a></header>{result.kind === "upstream_error" ? <section className={`${styles.errorPanel} ${styles.adminRouteError}`} role="alert"><h2>暂时无法读取回收站</h2><p>删除记录没有改变，请检查连接后重试。</p></section> : <DeletedPostList initial={result.data} />}</main>;
}
