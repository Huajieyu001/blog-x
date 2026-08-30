"use client";

import { logoutResponseSchema } from "@blog-x/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearEditorRecoverySnapshots, getEditorRecoveryStorage } from "./_components/article-editor-recovery";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (response.ok) logoutResponseSchema.safeParse(await response.json());
    } finally {
      const storage = getEditorRecoveryStorage();
      if (storage) clearEditorRecoverySnapshots(storage);
      router.replace("/login");
      router.refresh();
      setPending(false);
    }
  }

  return <button type="button" onClick={() => void logout()} disabled={pending}>{pending ? "正在退出…" : "退出登录"}</button>;
}
