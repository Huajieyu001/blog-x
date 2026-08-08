import { notFound } from "next/navigation";
import ArticleBody from "../_components/ArticleBody";
import { getPublicAbout } from "../lib/api";
import styles from "../public.module.css";
export const dynamic = "force-dynamic";
export default async function AboutPage(){const result=await getPublicAbout();if(result==="not_found")notFound();if(!result)throw new Error("About unavailable");return <main className={styles.page}><article className={styles.articleShell}><header className={styles.articleHeader}><h1>{result.title}</h1></header><ArticleBody renderedHtml={result.renderedHtml}/></article></main>;}
