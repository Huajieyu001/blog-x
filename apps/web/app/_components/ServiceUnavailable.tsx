import Link from "next/link";
import styles from "../public.module.css";

export default function ServiceUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.recovery} data-testid="service-unavailable">
        <p className={styles.eyebrow}>Temporary interruption</p>
        <h1>暂时无法加载内容</h1>
        <p>服务似乎暂时不可用，请重试或返回首页。</p>
        <div className={styles.recoveryActions}>
          <button type="button" onClick={onRetry}>重试</button>
          <Link href="/">返回首页</Link>
        </div>
      </section>
    </main>
  );
}
