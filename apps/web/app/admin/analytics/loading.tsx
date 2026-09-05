import styles from "../admin.module.css";

export default function AnalyticsLoading() {
  return <div className={styles.analyticsPage} aria-busy="true">
    <section className={styles.loadingPanel} role="status" aria-label="正在读取匿名 PV 趋势…">
      <p className={styles.eyebrow}>BLOG X / 管理</p>
      <h1>正在读取匿名 PV 趋势…</h1>
      <div className={styles.loadingBlocks} aria-hidden="true"><i /><i /><i /></div>
    </section>
  </div>;
}
