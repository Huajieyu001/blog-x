import { cookies } from "next/headers";
import { getAdminSiteSettingsResult } from "../../lib/api";
import SettingsEditor from "../_components/SettingsEditor";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

export default async function SiteSettingsPage() {
  const result = await getAdminSiteSettingsResult((await cookies()).toString());
  if (result.kind === "upstream_error") return <main className={styles.workspace}><section className={styles.errorPanel}><h1>站点设置暂不可用</h1><p>无法读取设置。恢复连接后重新加载即可继续编辑。</p></section></main>;
  return <SettingsEditor initial={result.kind === "ok" ? result.data : null} />;
}
