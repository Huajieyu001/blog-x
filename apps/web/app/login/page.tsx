"use client";

import { loginInputSchema, loginResponseSchema } from "@blog-x/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <main>
      <h1>管理员登录</h1>
      <form onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }}>
        <label>用户名<input name="username" autoComplete="username" required /></label>
        <label>密码<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit" disabled={pending}>{pending ? "登录中…" : "登录"}</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
