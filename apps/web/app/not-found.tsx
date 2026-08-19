import Link from "next/link";
import styles from "./public.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.recovery}>
        <h1>没有找到这个页面</h1>
        <p>它可能已被移动，或尚未发布。</p>
        <Link href="/">返回首页</Link>
      </section>
    </main>
  );
}
