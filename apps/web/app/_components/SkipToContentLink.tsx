"use client";

import { usePathname } from "next/navigation";
import styles from "../layout.module.css";

export default function SkipToContentLink() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;

  return <a className={styles.skipLink} href="#main-content">跳到正文</a>;
}
