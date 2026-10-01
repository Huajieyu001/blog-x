import Link from "next/link";
import { defaultSiteSettings } from "@blog-x/contracts";
import ArticleBody from "../_components/ArticleBody";
import { getPublicAbout, getPublicSiteSettings } from "../lib/api";
import { pageMetadata } from "../lib/site-metadata";
import styles from "../public.module.css";
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const [result, siteResult] = await Promise.all([getPublicAbout(), getPublicSiteSettings()]);
  const site = siteResult.kind === "ok" ? siteResult.data : defaultSiteSettings;

  if (result.kind === "upstream_error") throw new Error("public content unavailable");
  if (result.kind === "not_found") {
    return pageMetadata({ title: "关于", description: site.description, path: "/about", site });
  }

  return pageMetadata({ title: result.data.title, description: `了解 ${result.data.title}。`, path: "/about", site });
}

export default async function AboutPage() {
  const [result, siteResult] = await Promise.all([getPublicAbout(), getPublicSiteSettings()]);
  const site = siteResult.kind === "ok" ? siteResult.data : defaultSiteSettings;

  if (result.kind === "upstream_error") throw new Error("public content unavailable");
  if (result.kind === "not_found") {
    return (
      <main className={styles.page}>
        <article className={styles.articleShell}>
          <header className={styles.articleHeader}>
            <p className={styles.eyebrow}>About</p>
            <h1>{site.name}</h1>
            <p className={styles.articleSummary}>{site.description}</p>
          </header>
          <section className={`${styles.empty} ${styles.emptyWelcome}`} aria-labelledby="about-preparing-title">
            <h2 id="about-preparing-title">关于页面正在准备中</h2>
            <p>这里将分享这个博客的缘起、写作方向与长期记录。</p>
            <nav className={styles.emptyActions} aria-label="关于页面导航">
              <Link href="/" prefetch={false}>返回最新文章</Link>
            </nav>
          </section>
        </article>
      </main>
    );
  }

  return <main className={styles.page}><article className={styles.articleShell}><header className={styles.articleHeader}><p className={styles.eyebrow}>About</p><h1>{result.data.title}</h1></header><ArticleBody renderedHtml={result.data.renderedHtml} /></article></main>;
}
