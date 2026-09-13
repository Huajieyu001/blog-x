"use client";

import { logoutResponseSchema } from "@blog-x/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearEditorRecoverySnapshots, getEditorRecoveryStorage } from "./_components/article-editor-recovery";
import styles from "./admin-shell.module.css";

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (pending) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      const parsed = logoutResponseSchema.safeParse(await response.json().catch(() => null));

      if (!response.ok || !parsed.success) throw new Error("logout failed");

      const storage = getEditorRecoveryStorage();
      if (storage) clearEditorRecoverySnapshots(storage);
      router.replace("/login");
      router.refresh();
    } catch {
      setError("退出失败，请重试；未保存的本机恢复副本仍然保留。");
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
