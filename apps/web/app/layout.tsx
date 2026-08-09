import type { Metadata } from "next";
import PublicHeader from "./_components/PublicHeader";

export const metadata: Metadata = { title: "Blog X", description: "个人技术博客" };

const themeBootstrap = `(function(){var p='system';try{var s=localStorage.getItem('blog-x-theme');if(s==='light'||s==='dark'||s==='system'){p=s}else{localStorage.setItem('blog-x-theme','system')}}catch(e){}var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.js='true'}())`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body><PublicHeader />{children}</body>
    </html>
  );
}
