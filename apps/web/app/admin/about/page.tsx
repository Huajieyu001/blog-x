import { cookies } from "next/headers";
import { getAdminAboutResult } from "../../lib/api";
import AboutEditor from "../_components/AboutEditor";
import styles from "../admin.module.css";

export default async function AdminAboutPage() {
  const result = await getAdminAboutResult((await cookies()).toString());
  if (result.kind === "upstream_error") {
    return (
      <main className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div><p className={styles.eyebrow}>BLOG X / 站点信息</p><h1>关于页</h1><p>维护访客在公开关于页看到的站点介绍。</p></div>
          <a className={styles.secondaryLink} href="/admin">返回工作台</a>
        </header>
        <section className={`${styles.errorPanel} ${styles.adminRouteError}`} role="alert">
          <h2>暂时无法读取关于页</h2>
          <p>已有内容没有改变。恢复连接后重新加载即可继续编辑。</p>
          <a href="/admin/about">重新加载关于页</a>
        </section>
      </main>
    );
  }
  return <AboutEditor initial={result.kind === "ok" ? result.data : null} />;
}
