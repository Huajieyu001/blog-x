import styles from "../admin.module.css";

export default function AnalyticsLoading() {
  return <main className={styles.workspace} aria-busy="true">
    <header className={styles.workspaceHeader}>
      <div><p className={styles.eyebrow}>BLOG X / 访问统计</p><h1>访问统计</h1><p>正在读取匿名 PV 趋势…</p></div>
    </header>
    <section className={styles.loadingPanel} role="status" aria-label="正在读取匿名 PV 趋势…">
      <span className={styles.srOnly}>正在读取匿名 PV 趋势…</span>
      <div className={styles.loadingBlocks} aria-hidden="true"><i /><i /><i /></div>
      <i className={styles.loadingChart} aria-hidden="true" />
    </section>
  </main>;
}
