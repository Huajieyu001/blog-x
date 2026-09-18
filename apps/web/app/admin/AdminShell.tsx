"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import ThemeControl from "../_components/ThemeControl";
import LogoutButton from "./LogoutButton";
import styles from "./admin-shell.module.css";

const navigation = [
  { href: "/admin", label: "工作台", active: (path: string, hash: string) => path === "/admin" && hash !== "#articles" },
  { href: "/admin#articles", label: "文章管理", active: (path: string, hash: string) => path.startsWith("/admin/posts/") || (path === "/admin" && hash === "#articles") },
  { href: "/admin/new", label: "新建文章", active: (path: string) => path === "/admin/new" },
  { href: "/admin/media", label: "媒体库", active: (path: string) => path.startsWith("/admin/media") },
  { href: "/admin/analytics", label: "访问统计", active: (path: string) => path.startsWith("/admin/analytics") },
  { href: "/admin/taxonomy", label: "分类与标签", active: (path: string) => path.startsWith("/admin/taxonomy") },
  { href: "/admin/about", label: "关于页", active: (path: string) => path.startsWith("/admin/about") },
  { href: "/admin/settings", label: "站点设置", active: (path: string) => path.startsWith("/admin/settings") },
  { href: "/admin/trash", label: "回收站", active: (path: string) => path.startsWith("/admin/trash") },
  { href: "/admin/security", label: "账户安全", active: (path: string) => path.startsWith("/admin/security") },
  { href: "/admin/audit", label: "操作日志", active: (path: string) => path.startsWith("/admin/audit") },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hash, setHash] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    const synchronizeHash = () => setHash(window.location.hash);
    synchronizeHash();
    window.addEventListener("hashchange", synchronizeHash);
    return () => window.removeEventListener("hashchange", synchronizeHash);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let focusFrame: number | undefined;
    const drawerFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => firstLinkRef.current?.focus());
    });
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        window.requestAnimationFrame(() => toggleRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;
      const sidebar = sidebarRef.current;
      if (!sidebar) return;
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (!sidebar.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      window.cancelAnimationFrame(drawerFrame);
      if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", close);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#admin-content">跳到管理内容</a>
      <aside ref={sidebarRef} id="admin-navigation" className={styles.sidebar} data-open={open ? "true" : "false"} aria-label="后台导航">
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
              prefetch={false}
              aria-current={item.active(pathname, hash) ? "page" : undefined}
              onClick={() => {
                const moveFocusToContent = open;
                setOpen(false);
                if (item.href === "/admin") setHash("");
                else if (item.href === "/admin#articles") setHash("#articles");
                if (moveFocusToContent) window.requestAnimationFrame(() => contentRef.current?.focus());
              }}
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
        <div ref={contentRef} id="admin-content" className={styles.content} tabIndex={-1} inert={open ? true : undefined} aria-hidden={open ? true : undefined}>{children}</div>
      </div>
    </div>
  );
}
