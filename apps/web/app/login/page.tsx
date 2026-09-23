"use client";

import { loginInputSchema, loginResponseSchema } from "@blog-x/contracts";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { fetchWithDeadline, isFetchDeadlineExceeded } from "../lib/client-fetch";
import styles from "./login.module.css";

type LoginError = { message: string; credentials: boolean } | null;

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LoginError>(null);
  const pendingRef = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  function showError(message: string, credentials = false) {
    setError({ message, credentials });
    window.requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function submit(form: FormData) {
    if (pendingRef.current) return;
    const parsed = loginInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      showError("请填写有效的用户名和密码。", true);
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetchWithDeadline("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) showError("用户名或密码错误。", true);
        else if (response.status === 429) showError("尝试次数过多，请稍后再试。", true);
        else if (response.status === 403) showError("登录请求已失效，请刷新页面后重试。");
        else showError("登录服务暂时不可用，请稍后重试。");
        return;
      }
      if (!loginResponseSchema.safeParse(body).success) {
        showError("登录服务返回了无法识别的结果，请稍后重试。");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch (error) {
      showError(isFetchDeadlineExceeded(error)
        ? "登录请求超时，服务器可能已完成登录；请刷新页面确认后再重试。"
        : "暂时无法连接登录服务，请检查网络后重试。");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.introduction} aria-labelledby="login-title">
        <a className={styles.brand} href="/">Blog X</a>
        <div>
          <p className={styles.eyebrow}>ADMINISTRATOR ACCESS</p>
          <h1 id="login-title">管理员登录</h1>
          <p className={styles.description}>回到写作空间，管理文章、站点内容与访问趋势。</p>
        </div>
        <p className={styles.privateNote}><span aria-hidden="true">●</span> 单管理员私有入口</p>
      </section>
      <section className={styles.panel} aria-label="登录表单">
        <div className={styles.card}>
          <header><p className={styles.eyebrow}>欢迎回来</p><h2>进入管理后台</h2><p>请输入为 Blog X 配置的管理员账号。</p></header>
          <form aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }}>
            <label>用户名<input name="username" autoComplete="username" required disabled={pending} aria-invalid={Boolean(error?.credentials)} aria-describedby={error ? "login-error" : undefined} onChange={() => { if (error) setError(null); }} /></label>
            <label>密码<input name="password" type="password" autoComplete="current-password" required disabled={pending} aria-invalid={Boolean(error?.credentials)} aria-describedby={error ? "login-error" : undefined} onChange={() => { if (error) setError(null); }} /></label>
            {error ? <p ref={errorRef} tabIndex={-1} id="login-error" className={styles.error} role="alert">{error.message}</p> : <p className={styles.hint}>登录状态仅通过安全 Cookie 保存，不会把密码存入浏览器。</p>}
            <button type="submit" disabled={pending}>{pending ? "登录中…" : "登录"}</button>
          </form>
          <a className={styles.backLink} href="/">← 返回博客首页</a>
        </div>
      </section>
    </main>
  );
}
