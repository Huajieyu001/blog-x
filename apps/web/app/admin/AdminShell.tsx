"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import ThemeControl from "../_components/ThemeControl";
import LogoutButton from "./LogoutButton";
import styles from "./admin-shell.module.css";

const navigation = [
  { href: "/admin", label: "工作台", active: (path: string) => path === "/admin" },
  { href: "/admin#articles", label: "文章管理", active: (path: string) => path.startsWith("/admin/posts/") },
  { href: "/admin/new", label: "新建文章", active: (path: string) => path === "/admin/new" },
  { href: "/admin/analytics", label: "访问统计", active: (path: string) => path.startsWith("/admin/analytics") },
  { href: "/admin/taxonomy", label: "分类与标签", active: (path: string) => path.startsWith("/admin/taxonomy") },
  { href: "/admin/about", label: "关于页", active: (path: string) => path.startsWith("/admin/about") },
  { href: "/admin/audit", label: "操作日志", active: (path: string) => path.startsWith("/admin/audit") },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => firstLinkRef.current?.focus());
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      window.requestAnimationFrame(() => toggleRef.current?.focus());
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#admin-content">跳到管理内容</a>
      <aside id="admin-navigation" className={styles.sidebar} data-open={open ? "true" : "false"} aria-label="后台导航">
        <div className={styles.identity}>
          <Link className={styles.brand} href="/admin">Blog X</Link>
          <span>ADMIN CONSOLE</span>
        </div>
        <nav className={styles.navigation} aria-label="管理功能">
          {navigation.map((item, index) => (
            <Link
              key={item.href}
              ref={index === 0 ? firstLinkRef : undefined}
              href={item.href}
              aria-current={item.active(pathname) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.theme}><ThemeControl /></div>
          <Link className={styles.siteLink} href="/">查看博客首页 <span aria-hidden="true">↗</span></Link>
          <LogoutButton className={styles.logoutButton} />
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.mobileHeader}>
          <Link className={styles.mobileBrand} href="/admin">Blog X <span>管理</span></Link>
          <button
            ref={toggleRef}
            type="button"
            className={styles.menuButton}
            aria-expanded={open}
            aria-controls="admin-navigation"
            aria-label={open ? "关闭后台导航" : "打开后台导航"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "关闭" : "菜单"}
          </button>
        </header>
        {open ? <button className={styles.backdrop} type="button" aria-label="关闭后台导航" onClick={() => { setOpen(false); toggleRef.current?.focus(); }} /> : null}
        <div id="admin-content" className={styles.content} tabIndex={-1}>{children}</div>
      </div>
    </div>
  );
}
