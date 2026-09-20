import type { Metadata } from "next";
import { defaultSiteSettings } from "@blog-x/contracts";
import PublicHeader from "./_components/PublicHeader";
import SkipToContentLink from "./_components/SkipToContentLink";
import { getPublicSiteSettings } from "./lib/api";
import { publicOrigin } from "./lib/site-metadata";
import styles from "./layout.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicSiteSettings();
  const site = result.kind === "ok" ? result.data : defaultSiteSettings;
  return {
    metadataBase: publicOrigin(),
    title: { default: site.name, template: `%s | ${site.name}` },
    description: site.description,
    openGraph: { title: site.name, description: site.description, type: "website", url: "/", siteName: site.name },
    alternates: { types: { "application/rss+xml": "/rss.xml" } },
  };
}

const themeBootstrap = `(function(){var p='system';try{var s=localStorage.getItem('blog-x-theme');if(s==='light'||s==='dark'||s==='system'){p=s}else{localStorage.setItem('blog-x-theme','system')}}catch(e){}var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.js='true'}())`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const result = await getPublicSiteSettings();
  const site = result.kind === "ok" ? result.data : defaultSiteSettings;
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>
        <SkipToContentLink />
        <PublicHeader siteName={site.name} />
        <div id="main-content" tabIndex={-1}>{children}</div>
        <footer className={styles.icpFooter}>
          {site.publicInfo ? <p>{site.publicInfo}</p> : null}
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{site.registrationNumber}</a>
        </footer>
      </body>
    </html>
  );
}
