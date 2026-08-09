import { notFound } from "next/navigation";
import ArticleBody from "../_components/ArticleBody";
import { getPublicAbout } from "../lib/api";
import { pageMetadata } from "../lib/site-metadata";
import styles from "../public.module.css";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const result = await getPublicAbout();
  if (result.kind === "not_found") notFound();
  if (result.kind === "upstream_error") throw new Error("public content unavailable");
  return pageMetadata({ title: result.data.title, description: `了解 ${result.data.title}。`, path: "/about" });
}
export default async function AboutPage() {
  const result = await getPublicAbout();
  if (result.kind === "not_found") notFound();
  if (result.kind === "upstream_error") throw new Error("public content unavailable");
  return <main className={styles.page}><article className={styles.articleShell}><header className={styles.articleHeader}><p className={styles.eyebrow}>About</p><h1>{result.data.title}</h1></header><ArticleBody renderedHtml={result.data.renderedHtml} /></article></main>;
}
