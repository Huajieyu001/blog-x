import styles from "./admin.module.css";

export default function AdminLoading() {
  return (
    <main className={styles.workspace} aria-busy="true" aria-labelledby="admin-loading-title">
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>BLOG X / 管理</p>
          <h1 id="admin-loading-title">正在打开工作区</h1>
          <p>正在读取最新内容，请稍候。</p>
        </div>
      </header>
      <section className={styles.loadingPanel} role="status">
        <span className={styles.srOnly}>后台内容正在加载</span>
        <div className={styles.loadingBlocks} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.loadingList} aria-hidden="true"><i /><i /><i /></div>
      </section>
    </main>
  );
}
