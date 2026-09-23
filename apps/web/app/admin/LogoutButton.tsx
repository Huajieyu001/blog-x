"use client";

import { logoutResponseSchema } from "@blog-x/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fetchWithDeadline, isFetchDeadlineExceeded } from "../lib/client-fetch";
import { clearEditorRecoverySnapshots, getEditorRecoveryStorage } from "./_components/article-editor-recovery";
import styles from "./admin-shell.module.css";

const ambiguousLogoutResultMessage = "网络中断或响应异常，退出结果未知；请刷新确认。本机恢复副本仍然保留。";

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (pending) return;
    setPending(true);
    setError("");

    try {
      const response = await fetchWithDeadline("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      const parsed = logoutResponseSchema.safeParse(await response.json().catch(() => null));

      if (!response.ok) {
        setError("退出失败，请重试；未保存的本机恢复副本仍然保留。");
        return;
      }
      if (!parsed.success) {
        setError(ambiguousLogoutResultMessage);
        return;
      }

      const storage = getEditorRecoveryStorage();
      if (storage) clearEditorRecoverySnapshots(storage);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setError(isFetchDeadlineExceeded(error)
        ? "退出请求超时，服务器可能已完成退出；请刷新确认。本机恢复副本仍然保留。"
        : ambiguousLogoutResultMessage);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.logoutGroup}>
      <button
        className={className}
        type="button"
        onClick={() => void logout()}
        disabled={pending}
        aria-describedby={error ? "admin-logout-error" : undefined}
      >
        {pending ? "正在退出…" : error ? "重新尝试退出" : "退出登录"}
      </button>
      {error ? (
        <p id="admin-logout-error" className={styles.logoutError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
