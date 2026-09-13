"use client";

import { useEffect } from "react";
import styles from "./admin.module.css";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Administrator workspace failed to render", error);
  }, [error]);

  return (
    <main className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>BLOG X / 管理</p>
          <h1>工作区暂时不可用</h1>
          <p>你的内容没有改变，可以立即重试或先返回工作台。</p>
        </div>
      </header>
      <section className={`${styles.errorPanel} ${styles.adminRouteError}`} role="alert">
        <h2>页面没有成功载入</h2>
        <p>可能是短暂的连接问题。重试不会重复提交或修改现有内容。</p>
        <div className={styles.errorActions}>
          <button type="button" onClick={reset}>重新加载</button>
          <a href="/admin">返回工作台</a>
        </div>
      </section>
    </main>
  );
}
