import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSessionStatus } from "../lib/api";
import AdminShell from "./AdminShell";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "管理后台",
  robots: { index: false, follow: false },
  openGraph: null,
  alternates: null,
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieHeader = (await cookies()).toString();
  const session = await getSessionStatus(cookieHeader);
  if (session.kind === "unauthorized") redirect("/login");
  if (session.kind === "upstream_error") return (
    <main className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>BLOG X / 管理</p>
          <h1>管理服务暂时不可用</h1>
          <p>暂时无法确认登录状态，未显示任何私有内容。</p>
        </div>
      </header>
      <section className={`${styles.errorPanel} ${styles.adminRouteError}`} role="alert">
        <h2>登录状态确认失败</h2>
        <p>可能是短暂的连接问题。恢复后可安全地重新确认，不需要重复提交内容。</p>
        <div className={styles.errorActions}>
          <a href="/admin">重新确认</a>
          <a href="/">返回博客首页</a>
        </div>
      </section>
    </main>
  );

  return <AdminShell>{children}</AdminShell>;
}
