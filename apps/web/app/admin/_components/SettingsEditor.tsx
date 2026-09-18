"use client";

import { adminSiteSettingsSchema, defaultSiteSettings, siteSettingsInputSchema, type AdminSiteSettings } from "@blog-x/contracts";
import { useState } from "react";
import styles from "../admin.module.css";

type Field = "name" | "description" | "publicInfo";
function snapshot(name: string, description: string, publicInfo: string) { return JSON.stringify([name, description, publicInfo]); }

export default function SettingsEditor({ initial }: { initial: AdminSiteSettings | null }) {
  const [name, setName] = useState(initial?.name ?? defaultSiteSettings.name);
  const [description, setDescription] = useState(initial?.description ?? defaultSiteSettings.description);
  const [publicInfo, setPublicInfo] = useState(initial?.publicInfo ?? defaultSiteSettings.publicInfo);
  const [saved, setSaved] = useState(() => snapshot(initial?.name ?? defaultSiteSettings.name, initial?.description ?? defaultSiteSettings.description, initial?.publicInfo ?? defaultSiteSettings.publicInfo));
  const [version, setVersion] = useState<string | null>(initial?.version ?? null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const dirty = snapshot(name, description, publicInfo) !== saved;

  function update(field: Field, value: string) { if (field === "name") setName(value); else if (field === "description") setDescription(value); else setPublicInfo(value); }
  async function save() {
    const parsed = siteSettingsInputSchema.safeParse({ name, description, publicInfo, version });
    if (!parsed.success) { setMessage("请检查站点名称、简介和公开展示信息。"); return; }
    setPending(true); setMessage("正在保存…");
    try {
      const response = await fetch("/api/admin/site-settings", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (response.status === 409) { setMessage("设置已在其他位置更新，请刷新页面后再提交。"); return; }
      if (!response.ok) { setMessage("站点设置保存失败，请重试。"); return; }
      const settings = adminSiteSettingsSchema.safeParse(await response.json().catch(() => null));
      if (!settings.success) { setMessage("服务器返回了无法识别的设置，请重试。"); return; }
      setName(settings.data.name); setDescription(settings.data.description); setPublicInfo(settings.data.publicInfo); setVersion(settings.data.version); setSaved(snapshot(settings.data.name, settings.data.description, settings.data.publicInfo)); setMessage("站点设置已保存。");
    } catch { setMessage("站点设置保存失败，请重试。"); }
    finally { setPending(false); }
  }
  return <main className={styles.workspace} aria-busy={pending}>
    <header className={styles.workspaceHeader}><div><p className={styles.eyebrow}>BLOG X / SITE IDENTITY</p><h1>站点设置</h1><p>维护公开显示的名称、简介和补充信息。</p></div><a className={styles.primaryLink} href="/">查看首页</a></header>
    <p className={styles.contentStatus}><strong>{dirty ? "有未保存更改" : version ? "设置已保存" : "使用默认设置"}</strong></p>
    <section className={styles.metadata} aria-label="站点设置字段">
      <label>站点名称<input value={name} disabled={pending} onChange={(event) => update("name", event.target.value)} /></label>
      <label>站点简介<textarea value={description} disabled={pending} rows={3} onChange={(event) => update("description", event.target.value)} /></label>
      <label>公开展示信息<textarea value={publicInfo} disabled={pending} rows={4} onChange={(event) => update("publicInfo", event.target.value)} /></label>
      <p className={styles.headerDescription}>备案号固定保留为“{defaultSiteSettings.registrationNumber}”，并始终链接至工信部备案查询页面。</p>
    </section>
    <div className={styles.actionButtons}><button type="button" disabled={pending || !dirty} onClick={() => { void save(); }}>{pending ? "正在保存…" : "保存站点设置"}</button></div>
    <p className={styles.status} role="status" aria-label="站点设置状态">{message}</p>
  </main>;
}
