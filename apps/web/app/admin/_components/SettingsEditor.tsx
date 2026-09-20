"use client";

import { adminSiteSettingsSchema, defaultSiteSettings, siteSettingsInputSchema, siteSettingsLimits, type AdminSiteSettings } from "@blog-x/contracts";
import { useEffect, useRef, useState } from "react";
import styles from "../admin.module.css";

type Field = "name" | "description" | "publicInfo";
function snapshot(name: string, description: string, publicInfo: string) { return JSON.stringify([name, description, publicInfo]); }

const fieldLabels: Record<Field, string> = {
  name: "站点名称",
  description: "站点简介",
  publicInfo: "公开展示信息",
};

function validationMessage(field: Field, issue: { code: string; maximum?: number | bigint }) {
  const label = fieldLabels[field];
  if (issue.code === "too_big") return `${label}不能超过 ${issue.maximum} 个字符。`;
  if (issue.code === "too_small") return `${label}不能为空。`;
  return `${label}格式不正确。`;
}

export default function SettingsEditor({ initial }: { initial: AdminSiteSettings | null }) {
  const [name, setName] = useState(initial?.name ?? defaultSiteSettings.name);
  const [description, setDescription] = useState(initial?.description ?? defaultSiteSettings.description);
  const [publicInfo, setPublicInfo] = useState(initial?.publicInfo ?? defaultSiteSettings.publicInfo);
  const [saved, setSaved] = useState(() => snapshot(initial?.name ?? defaultSiteSettings.name, initial?.description ?? defaultSiteSettings.description, initial?.publicInfo ?? defaultSiteSettings.publicInfo));
  const [version, setVersion] = useState<string | null>(initial?.version ?? null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const fieldRefs = useRef<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>({ name: null, description: null, publicInfo: null });
  const dirty = snapshot(name, description, publicInfo) !== saved;

  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);

  function update(field: Field, value: string) {
    if (field === "name") setName(value); else if (field === "description") setDescription(value); else setPublicInfo(value);
    setFieldErrors((errors) => {
      if (!errors[field]) return errors;
      const { [field]: _, ...remaining } = errors;
      return remaining;
    });
  }

  async function save() {
    const parsed = siteSettingsInputSchema.safeParse({ name, description, publicInfo, version });
    if (!parsed.success) {
      const errors: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "name" || field === "description" || field === "publicInfo") && !errors[field]) errors[field] = validationMessage(field, issue);
      }
      setFieldErrors(errors);
      setMessage("请检查站点名称、简介和公开展示信息。");
      for (const field of ["name", "description", "publicInfo"] as const) {
        if (errors[field]) {
          fieldRefs.current[field]?.focus();
          break;
        }
      }
      return;
    }
    setPending(true); setMessage("正在保存…");
    try {
      const response = await fetch("/api/admin/site-settings", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (response.status === 409) { setMessage("设置已在其他位置更新，请刷新页面后再提交。"); return; }
      if (!response.ok) { setMessage("站点设置保存失败，请重试。"); return; }
      const settings = adminSiteSettingsSchema.safeParse(await response.json().catch(() => null));
      if (!settings.success) { setMessage("服务器返回了无法识别的设置，请重试。"); return; }
      setName(settings.data.name); setDescription(settings.data.description); setPublicInfo(settings.data.publicInfo); setVersion(settings.data.version); setSaved(snapshot(settings.data.name, settings.data.description, settings.data.publicInfo)); setFieldErrors({}); setMessage("站点设置已保存。");
    } catch { setMessage("站点设置保存失败，请重试。"); }
    finally { setPending(false); }
  }
  return <main className={styles.workspace} aria-busy={pending}>
    <header className={styles.workspaceHeader}><div><p className={styles.eyebrow}>BLOG X / SITE IDENTITY</p><h1>站点设置</h1><p>维护公开显示的名称、简介和补充信息。</p></div><a className={styles.primaryLink} href="/">查看首页</a></header>
    <p className={styles.contentStatus}><strong>{dirty ? "有未保存更改" : version ? "设置已保存" : "使用默认设置"}</strong></p>
    <section className={styles.metadata} aria-label="站点设置字段">
      <label className={styles.settingsField} htmlFor="site-settings-name">站点名称
        <input ref={(element) => { fieldRefs.current.name = element; }} id="site-settings-name" value={name} disabled={pending} maxLength={siteSettingsLimits.name} aria-invalid={fieldErrors.name ? true : undefined} aria-describedby={["site-settings-name-counter", fieldErrors.name ? "site-settings-name-error" : ""].filter(Boolean).join(" ")} onChange={(event) => update("name", event.target.value)} />
        <span id="site-settings-name-counter" className={styles.fieldCounter}>已输入 {name.length}/{siteSettingsLimits.name} 个字符</span>
        {fieldErrors.name ? <span id="site-settings-name-error" className={styles.fieldError} role="alert">{fieldErrors.name}</span> : null}
      </label>
      <label className={styles.settingsField} htmlFor="site-settings-description">站点简介
        <textarea ref={(element) => { fieldRefs.current.description = element; }} id="site-settings-description" value={description} disabled={pending} maxLength={siteSettingsLimits.description} rows={3} aria-invalid={fieldErrors.description ? true : undefined} aria-describedby={["site-settings-description-counter", fieldErrors.description ? "site-settings-description-error" : ""].filter(Boolean).join(" ")} onChange={(event) => update("description", event.target.value)} />
        <span id="site-settings-description-counter" className={styles.fieldCounter}>已输入 {description.length}/{siteSettingsLimits.description} 个字符</span>
        {fieldErrors.description ? <span id="site-settings-description-error" className={styles.fieldError} role="alert">{fieldErrors.description}</span> : null}
      </label>
      <label className={styles.settingsField} htmlFor="site-settings-public-info">公开展示信息
        <textarea ref={(element) => { fieldRefs.current.publicInfo = element; }} id="site-settings-public-info" value={publicInfo} disabled={pending} maxLength={siteSettingsLimits.publicInfo} rows={4} aria-invalid={fieldErrors.publicInfo ? true : undefined} aria-describedby={["site-settings-public-info-counter", fieldErrors.publicInfo ? "site-settings-public-info-error" : ""].filter(Boolean).join(" ")} onChange={(event) => update("publicInfo", event.target.value)} />
        <span id="site-settings-public-info-counter" className={styles.fieldCounter}>已输入 {publicInfo.length}/{siteSettingsLimits.publicInfo} 个字符</span>
        {fieldErrors.publicInfo ? <span id="site-settings-public-info-error" className={styles.fieldError} role="alert">{fieldErrors.publicInfo}</span> : null}
      </label>
      <p className={styles.headerDescription}>备案号固定保留为“{defaultSiteSettings.registrationNumber}”，并始终链接至工信部备案查询页面。</p>
    </section>
    <div className={styles.actionButtons}><button type="button" disabled={pending || !dirty} onClick={() => { void save(); }}>{pending ? "正在保存…" : "保存站点设置"}</button></div>
    <p className={styles.status} role="status" aria-label="站点设置状态">{message}</p>
  </main>;
}
