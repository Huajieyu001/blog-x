import type { Metadata } from "next";

export const metadata: Metadata = { title: "Blog X", description: "个人技术博客" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
