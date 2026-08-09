"use client";

import { useEffect, useState } from "react";
import styles from "../public.module.css";

type ThemePreference = "light" | "dark" | "system";
const preferences: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

function isTheme(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function applyTheme(preference: ThemePreference) {
  const resolved = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.theme = resolved;
}

export default function ThemeControl() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem("blog-x-theme"); } catch { /* system remains safe */ }
    const initial = isTheme(stored) ? stored : "system";
    if (!isTheme(stored)) {
      try { window.localStorage.setItem("blog-x-theme", "system"); } catch { /* storage is optional */ }
    }
    setPreference(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => { if (preference === "system") applyTheme("system"); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preference]);

  function choose(next: ThemePreference) {
    setPreference(next);
    applyTheme(next);
    try { window.localStorage.setItem("blog-x-theme", next); } catch { /* explicit choice still applies for this page */ }
  }

  return (
    <fieldset className={styles.themeControl} data-testid="theme-toggle">
      <legend>{`主题：${preferences.find((item) => item.value === preference)?.label ?? "跟随系统"}`}</legend>
      <div className={styles.themeOptions} role="radiogroup" aria-label="切换主题">
        {preferences.map((item) => (
          <label key={item.value}>
            <input type="radio" name="blog-x-theme" value={item.value} checked={preference === item.value} onChange={() => choose(item.value)} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
