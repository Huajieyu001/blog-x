"use client";

import { loginInputSchema, loginResponseSchema } from "@blog-x/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(form: FormData) {
    const parsed = loginInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      setError("用户名或密码错误");
      return;
    }

    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
        credentials: "same-origin",
      });
      if (!response.ok || !loginResponseSchema.safeParse(await response.json()).success) {
        setError("用户名或密码错误");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("用户名或密码错误");
    } finally {
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
            <label>用户名<input name="username" autoComplete="username" required aria-invalid={Boolean(error)} onChange={() => { if (error) setError(""); }} /></label>
            <label>密码<input name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} onChange={() => { if (error) setError(""); }} /></label>
            {error ? <p id="login-error" className={styles.error} role="alert">{error}</p> : <p className={styles.hint}>登录状态仅通过安全 Cookie 保存，不会把密码存入浏览器。</p>}
            <button type="submit" disabled={pending}>{pending ? "登录中…" : "登录"}</button>
          </form>
          <a className={styles.backLink} href="/">← 返回博客首页</a>
        </div>
      </section>
    </main>
  );
}
