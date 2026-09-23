"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithDeadline, isFetchDeadlineExceeded } from "../../lib/client-fetch";
import styles from "../admin.module.css";

export default function SecurityPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  async function submit(formElement: HTMLFormElement) {
    const form = new FormData(formElement);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword !== confirmation) { setError("两次输入的新密码不一致。"); requestAnimationFrame(() => errorRef.current?.focus()); return; }
    setPending(true); setError("");
    try {
      const response = await fetchWithDeadline("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ currentPassword, newPassword }) });
      if (!response.ok) { setError(response.status === 400 ? "当前密码错误或新密码不符合要求。" : "暂时无法修改密码，请稍后重试。"); requestAnimationFrame(() => errorRef.current?.focus()); return; }
      formElement.reset();
      router.replace("/login"); router.refresh();
    } catch (error) { setError(isFetchDeadlineExceeded(error) ? "改密请求超时，服务器可能已完成修改；请先尝试重新登录确认。" : "暂时无法修改密码，请检查网络后重试。"); requestAnimationFrame(() => errorRef.current?.focus()); }
    finally { setPending(false); }
  }
  return <main className={styles.workspace} aria-labelledby="security-title"><header className={styles.workspaceHeader}><div><p className={styles.eyebrow}>BLOG X / 账户安全</p><h1 id="security-title">账户安全</h1><p>修改密码后，所有已登录设备都需要重新登录。</p></div><a className={styles.secondaryLink} href="/admin">返回工作台</a></header><section className={styles.workspaceSection}><form onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><label>当前密码<input name="currentPassword" type="password" autoComplete="current-password" required disabled={pending} /></label><label>新密码<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required disabled={pending} /></label><label>确认新密码<input name="confirmation" type="password" autoComplete="new-password" minLength={12} required disabled={pending} /></label>{error ? <p ref={errorRef} tabIndex={-1} role="alert">{error}</p> : null}<button type="submit" disabled={pending}>{pending ? "正在修改…" : "修改密码"}</button></form></section></main>;
}
