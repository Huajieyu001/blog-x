import type { Metadata } from "next";
import PublicHeader from "./_components/PublicHeader";
import { publicOrigin } from "./lib/site-metadata";

export const metadata: Metadata = {
  metadataBase: publicOrigin(),
  title: { default: "Blog X", template: "%s | Blog X" },
  description: "记录代码、系统与长期实践。",
  openGraph: { title: "Blog X", description: "记录代码、系统与长期实践。", type: "website", url: "/", siteName: "Blog X" },
  alternates: { types: { "application/rss+xml": "/rss.xml" } },
};

const themeBootstrap = `(function(){var p='system';try{var s=localStorage.getItem('blog-x-theme');if(s==='light'||s==='dark'||s==='system'){p=s}else{localStorage.setItem('blog-x-theme','system')}}catch(e){}var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.js='true'}())`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body><PublicHeader />{children}</body>
    </html>
  );
}
