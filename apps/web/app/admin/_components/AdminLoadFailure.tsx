import styles from "../admin.module.css";

export default function AdminLoadFailure({ eyebrow, title, description, message, retryHref }: {
  eyebrow: string;
  title: string;
  description: string;
  message: string;
  retryHref: string;
}) {
  return (
    <main className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
        <a className={styles.secondaryLink} href="/admin#articles">返回文章管理</a>
      </header>
      <section className={`${styles.errorPanel} ${styles.adminRouteError}`} role="alert">
        <h2>编辑器数据未完整载入</h2>
        <p>{message} 为避免用不完整数据覆盖现有内容，本次没有打开编辑表单。</p>
        <a href={retryHref}>重新加载编辑器</a>
      </section>
    </main>
  );
}
