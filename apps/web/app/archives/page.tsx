import Link from "next/link";
import { defaultSiteSettings } from "@blog-x/contracts";
import { getArchives, getPublicSiteSettings } from "../lib/api";
import { pageMetadata } from "../lib/site-metadata";
import styles from "../public.module.css";
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const result = await getPublicSiteSettings();
  const site = result.kind === "ok" ? result.data : defaultSiteSettings;
  return pageMetadata({ title: "归档", description: "按时间浏览已发布文章。", path: "/archives", site });
}

export default async function ArchivesPage() {
  const result = await getArchives();
  if (result.kind !== "ok") throw new Error("public content unavailable");
  return (
    <main className={styles.page}>
      <section className={styles.feed}>
        <header className={styles.discoveryHeader}><p className={styles.eyebrow}>Timeline</p><h1>归档</h1></header>
        {result.data.years.length ? (
          <div className={styles.archiveList}>
            {result.data.years.map((year, index) => (
              <details key={year.year} open={index === 0}>
                <summary>{year.year} 年</summary>
                {year.months.map((month) => (
                  <section key={month.month} className={styles.archiveMonth}>
                    <h2>{year.year} 年 {month.month} 月</h2>
                    <ul>{month.items.map((item) => <li key={item.slug}><time dateTime={item.publishedAt}>{new Date(item.publishedAt).getDate()} 日</time><Link href={`/posts/${encodeURIComponent(item.slug)}`} prefetch={false}>{item.title}</Link></li>)}</ul>
                  </section>
                ))}
              </details>
            ))}
          </div>
        ) : <div className={styles.empty}><h2>还没有可归档的文章</h2><p>发布文章后会按时间显示在这里。</p></div>}
      </section>
    </main>
  );
}
