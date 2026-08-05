"use client";

import { useState } from "react";

export default function TracerAdmin() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [message, setMessage] = useState("");
  async function login(form: FormData) {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)), credentials: "same-origin" });
    if (!response.ok) return setMessage("用户名或密码错误");
    setLoggedIn(true); setMessage("已登录");
  }
  async function publish(form: FormData) {
    const response = await fetch("/api/articles/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)), credentials: "same-origin" });
    if (!response.ok) return setMessage("发布失败");
    const article = await response.json() as { slug: string };
    window.location.assign(`/posts/${article.slug}`);
  }
  if (!loggedIn) return <main><h1>管理</h1><form action={login}><label>用户名<input name="username" required /></label><label>密码<input name="password" type="password" required /></label><button type="submit">登录</button></form><p role="status">{message}</p></main>;
  return <main><h1>发布文章</h1><form action={publish}><label>标题<input name="title" required /></label><label>Slug<input name="slug" required /></label><label>Markdown<textarea name="markdown" required /></label><button type="submit">发布</button></form><p role="status">{message}</p></main>;
}
