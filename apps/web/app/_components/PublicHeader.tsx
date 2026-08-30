"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "../public.module.css";
import SearchForm from "./SearchForm";
import ThemeControl from "./ThemeControl";

const links = [
  { href: "/", label: "文章", active: (path: string) => path === "/" || path.startsWith("/posts/") },
  { href: "/categories", label: "分类", active: (path: string) => path.startsWith("/categories") },
  { href: "/tags", label: "标签", active: (path: string) => path.startsWith("/tags") },
  { href: "/archives", label: "归档", active: (path: string) => path === "/archives" },
  { href: "/about", label: "关于", active: (path: string) => path === "/about" },
];

export default function PublicHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isPrivateSurface = pathname === "/login" || pathname.startsWith("/admin");

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.requestAnimationFrame(() => toggleRef.current?.focus());
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  if (isPrivateSurface) return null;
  return (
    <header className={styles.publicHeader} data-testid="public-header">
      <div className={styles.headerBar}>
        <Link className={styles.brand} href="/">Blog X</Link>
        <div className={styles.headerControls}>
          <ThemeControl />
          <button
            ref={toggleRef}
            className={styles.menuToggle}
            type="button"
            data-testid="mobile-menu-toggle"
            aria-label={open ? "关闭站点导航" : "打开站点导航"}
            aria-expanded={open}
            aria-controls="public-navigation"
            onClick={() => setOpen((value) => !value)}
          >
            <span aria-hidden="true">{open ? "关闭" : "菜单"}</span>
          </button>
        </div>
      </div>
      <nav
        id="public-navigation"
        className={styles.publicNav}
        data-testid="public-nav"
        data-open={open ? "true" : "false"}
        aria-label="站点导航"
      >
        {links.map((link) => (
          <Link key={link.href} href={link.href} aria-current={link.active(pathname) ? "page" : undefined} tabIndex={compact && !open ? -1 : undefined}>
            {link.label}
          </Link>
        ))}
        <a href="/rss.xml" type="application/rss+xml" tabIndex={compact && !open ? -1 : undefined}>订阅</a>
        <SearchForm tabIndex={compact && !open ? -1 : undefined} />
        <Link className={styles.managementLink} href="/admin" tabIndex={compact && !open ? -1 : undefined}>管理</Link>
      </nav>
    </header>
  );
}
