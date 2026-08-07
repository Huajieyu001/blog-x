"use client";

import { useState } from "react";
import { loginInputSchema, loginResponseSchema, publishInputSchema, publishedArticleSchema } from "@blog-x/contracts";

export default function TracerAdmin({ initiallyAuthenticated = false }: { initiallyAuthenticated?: boolean }) {
  const [loggedIn, setLoggedIn] = useState(initiallyAuthenticated);
  const [message, setMessage] = useState("");
  async function login(form: FormData) {
    const parsed = loginInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return setMessage("请输入用户名和密码");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data), credentials: "same-origin" });
    if (!response.ok) return setMessage("用户名或密码错误");
    if (!loginResponseSchema.safeParse(await response.json()).success) return setMessage("登录响应无效");
    setLoggedIn(true); setMessage("已登录");
  }
  async function publish(form: FormData) {
    const parsed = publishInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return setMessage("请填写有效文章信息");
    const response = await fetch("/api/articles/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data), credentials: "same-origin" });
    if (!response.ok) return setMessage("发布失败");
    if (!publishedArticleSchema.safeParse(await response.json()).success) return setMessage("发布响应无效");
    window.location.assign("/");
  }
  if (!loggedIn) return <main><h1>管理</h1><form method="post" onSubmit={(event) => { event.preventDefault(); void login(new FormData(event.currentTarget)); }}><label>用户名<input name="username" required /></label><label>密码<input name="password" type="password" required /></label><button type="submit">登录</button></form><p role="status">{message}</p></main>;
  return <main><h1>发布文章</h1><form method="post" onSubmit={(event) => { event.preventDefault(); void publish(new FormData(event.currentTarget)); }}><label>标题<input name="title" required /></label><label>Slug<input name="slug" required /></label><label>Markdown<textarea name="markdown" required /></label><button type="submit">发布</button></form><p role="status">{message}</p></main>;
}
