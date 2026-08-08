import { getArchives } from "../lib/api";
import styles from "../public.module.css";
export const dynamic = "force-dynamic";
export default async function ArchivesPage(){const data=await getArchives();if(!data)throw new Error("Archives unavailable");return <main className={styles.page}><section className={styles.feed}><h1>归档</h1>{data.years.length?data.years.map((year,index)=><details key={year.year} open={index===0}><summary>{year.year} 年</summary>{year.months.map(month=><section key={month.month}><h2>{year.year} 年 {month.month} 月</h2><ul>{month.items.map(item=><li key={item.slug}><a href={`/posts/${encodeURIComponent(item.slug)}`}>{item.title}</a></li>)}</ul></section>)}</details>):<div className={styles.empty}><h2>还没有可归档的文章</h2><p>发布文章后会按时间显示在这里。</p></div>}</section></main>;}
