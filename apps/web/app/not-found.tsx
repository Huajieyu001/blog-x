import styles from "./public.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.empty}>
        <h1>没有找到这个页面</h1>
        <p>它可能已被移动，或尚未发布。</p>
        <a href="/">返回首页</a>
      </section>
    </main>
  );
}
